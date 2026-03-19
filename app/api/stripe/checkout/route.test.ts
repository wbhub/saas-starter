import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 409 when a live subscription already exists", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { stripe_subscription_id: "sub_live" }, error: null });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle,
    };

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: { id: "user_123", email: "user@example.com" },
            },
          }),
        },
        from: vi.fn(() => query),
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByKey: () => ({ key: "starter", priceId: "price_starter" }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: { retrieve: vi.fn(), create: vi.fn() },
        subscriptions: { list: vi.fn() },
        checkout: { sessions: { create: vi.fn() } },
      },
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      upsertStripeCustomer: vi.fn(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({ planKey: "starter" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "You already have an active subscription.",
    });
  });

  it("creates and stamps first-time Stripe customers idempotently", async () => {
    const subscriptionsMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });
    const customersMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });

    const subscriptionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: subscriptionsMaybeSingle,
    };
    const customersQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: customersMaybeSingle,
    };

    const customersCreate = vi.fn().mockResolvedValue({ id: "cus_new" });
    const sessionsCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test" });
    const hasLiveSubscriptions = vi.fn().mockResolvedValue({ data: [] });
    const upsertStripeCustomer = vi.fn();

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: { id: "user_123", email: "user@example.com" },
            },
          }),
        },
        from: vi.fn((table: string) => {
          if (table === "subscriptions") {
            return subscriptionsQuery;
          }
          if (table === "stripe_customers") {
            return customersQuery;
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByKey: () => ({ key: "starter", priceId: "price_starter" }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: { retrieve: vi.fn(), create: customersCreate },
        subscriptions: { list: hasLiveSubscriptions },
        checkout: { sessions: { create: sessionsCreate } },
      },
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      upsertStripeCustomer,
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/checkout", {
        method: "POST",
        headers: { "x-idempotency-key": "client-key-1" },
        body: JSON.stringify({ planKey: "starter" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://checkout.stripe.test",
    });
    expect(customersCreate).toHaveBeenCalledWith(
      {
        email: "user@example.com",
        metadata: { supabase_user_id: "user_123" },
      },
      { idempotencyKey: "checkout:user_123:starter:client-key-1:customer" },
    );
    expect(upsertStripeCustomer).toHaveBeenCalledWith("user_123", "cus_new");
    expect(hasLiveSubscriptions).toHaveBeenCalledWith({
      customer: "cus_new",
      status: "all",
      limit: 100,
    });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_new",
        client_reference_id: "user_123",
      }),
      { idempotencyKey: "checkout:user_123:starter:client-key-1:session" },
    );
  });

  it("returns 409 when checkout for the same user/plan is already in progress", async () => {
    const subscriptionsMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });
    const customersMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });

    const subscriptionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: subscriptionsMaybeSingle,
    };
    const customersQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: customersMaybeSingle,
    };

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: { id: "user_123", email: "user@example.com" },
            },
          }),
        },
        from: vi.fn((table: string) => {
          if (table === "subscriptions") {
            return subscriptionsQuery;
          }
          if (table === "stripe_customers") {
            return customersQuery;
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi
        .fn()
        .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
        .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 8 }),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByKey: () => ({ key: "starter", priceId: "price_starter" }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: { retrieve: vi.fn(), create: vi.fn() },
        subscriptions: { list: vi.fn() },
        checkout: { sessions: { create: vi.fn() } },
      },
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      upsertStripeCustomer: vi.fn(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({ planKey: "starter" }),
      }),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("Retry-After")).toBe("8");
    await expect(response.json()).resolves.toEqual({
      error: "Checkout is already in progress. Please wait and try again.",
    });
  });
});

