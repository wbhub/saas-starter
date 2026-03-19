import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/stripe/change-plan", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 409 when subscription ownership does not match user", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { stripe_subscription_id: "sub_123", status: "active" },
      error: null,
    });
    const subscriptionsQuery = {
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
            data: { user: { id: "user_123", email: "user@example.com" } },
          }),
        },
        from: vi.fn(() => subscriptionsQuery),
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByKey: () => ({ key: "growth", priceId: "price_growth" }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription: vi.fn(),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        subscriptions: {
          retrieve: vi.fn().mockResolvedValue({
            id: "sub_123",
            customer: "cus_123",
            items: { data: [{ id: "si_123", price: { id: "price_starter" } }] },
          }),
          update: vi.fn(),
        },
        customers: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cus_123",
            metadata: { supabase_user_id: "different-user" },
          }),
        },
      },
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/change-plan", {
        method: "POST",
        body: JSON.stringify({ planKey: "growth" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "Billing identity mismatch detected. Start a new checkout to re-link your account.",
    });
  });

  it("passes idempotency key to Stripe update", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { stripe_subscription_id: "sub_123", status: "active" },
      error: null,
    });
    const subscriptionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    const update = vi.fn().mockResolvedValue({
      id: "sub_123",
      created: 1_700_000_000,
      status: "active",
      customer: "cus_123",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            id: "si_123",
            price: { id: "price_growth" },
            current_period_start: 1_700_000_000,
            current_period_end: 1_700_086_400,
          },
        ],
      },
    });
    const syncSubscription = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "user@example.com" } },
          }),
        },
        from: vi.fn(() => subscriptionsQuery),
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByKey: () => ({ key: "growth", priceId: "price_growth" }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        subscriptions: {
          retrieve: vi
            .fn()
            .mockResolvedValueOnce({
              id: "sub_123",
              customer: "cus_123",
              items: { data: [{ id: "si_123", price: { id: "price_starter" } }] },
            })
            .mockResolvedValueOnce({
              id: "sub_123",
              customer: "cus_123",
              items: { data: [{ id: "si_123", price: { id: "price_starter" } }] },
            }),
          update,
        },
        customers: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cus_123",
            metadata: { supabase_user_id: "user_123" },
          }),
        },
      },
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/change-plan", {
        method: "POST",
        headers: { "x-idempotency-key": "client-retry-1" },
        body: JSON.stringify({ planKey: "growth" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(
      "sub_123",
      {
        items: [{ id: "si_123", price: "price_growth" }],
        proration_behavior: "create_prorations",
      },
      { idempotencyKey: "change-plan:user_123:growth:client-retry-1" },
    );
    expect(syncSubscription).toHaveBeenCalledOnce();
  });

  it("returns success with syncPending when immediate sync fails", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { stripe_subscription_id: "sub_123", status: "active" },
      error: null,
    });
    const subscriptionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    const update = vi.fn().mockResolvedValue({
      id: "sub_123",
      created: 1_700_000_000,
      status: "active",
      customer: "cus_123",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            id: "si_123",
            price: { id: "price_growth" },
            current_period_start: 1_700_000_000,
            current_period_end: 1_700_086_400,
          },
        ],
      },
    });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "user@example.com" } },
          }),
        },
        from: vi.fn(() => subscriptionsQuery),
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByKey: () => ({ key: "growth", priceId: "price_growth" }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription: vi.fn().mockRejectedValue(new Error("db write failed")),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        subscriptions: {
          retrieve: vi
            .fn()
            .mockResolvedValueOnce({
              id: "sub_123",
              customer: "cus_123",
              items: { data: [{ id: "si_123", price: { id: "price_starter" } }] },
            })
            .mockResolvedValueOnce({
              id: "sub_123",
              customer: "cus_123",
              items: { data: [{ id: "si_123", price: { id: "price_starter" } }] },
            }),
          update,
        },
        customers: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cus_123",
            metadata: { supabase_user_id: "user_123" },
          }),
        },
      },
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/change-plan", {
        method: "POST",
        body: JSON.stringify({ planKey: "growth" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, syncPending: true });
    expect(update).toHaveBeenCalledOnce();
  });
});

