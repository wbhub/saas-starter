import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 400 when Stripe signature is missing", async () => {
    vi.doMock("next/headers", () => ({
      headers: async () => new Headers(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { STRIPE_WEBHOOK_SECRET: "whsec_test" },
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        webhooks: { constructEvent: vi.fn() },
      },
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription: vi.fn(),
      upsertStripeCustomer: vi.fn(),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing Stripe signature",
    });
  });

  it("returns 400 when Stripe signature verification fails", async () => {
    const constructEvent = vi.fn(() => {
      throw new Error("invalid signature");
    });

    vi.doMock("next/headers", () => ({
      headers: async () =>
        new Headers({
          "stripe-signature": "t=1,v1=invalid",
        }),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { STRIPE_WEBHOOK_SECRET: "whsec_test" },
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        webhooks: { constructEvent },
      },
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription: vi.fn(),
      upsertStripeCustomer: vi.fn(),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: '{"id":"evt_bad"}',
      }),
    );

    expect(constructEvent).toHaveBeenCalledWith(
      '{"id":"evt_bad"}',
      "t=1,v1=invalid",
      "whsec_test",
      300,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook signature verification failed.",
    });
  });

  it("prunes old dedupe rows after claiming a webhook event", async () => {
    const mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const lt = vi.fn().mockResolvedValue({ error: null });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });

    vi.doMock("next/headers", () => ({
      headers: async () =>
        new Headers({
          "stripe-signature": "t=1,v1=test",
        }),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { STRIPE_WEBHOOK_SECRET: "whsec_test" },
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        webhooks: {
          constructEvent: vi.fn(() => ({
            id: "evt_123",
            type: "invoice.created",
            data: { object: {} },
          })),
        },
      },
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription: vi.fn(),
      upsertStripeCustomer: vi.fn(),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn((table: string) => {
          if (table !== "stripe_webhook_events") {
            throw new Error(`Unexpected table: ${table}`);
          }

          return {
            insert,
            delete: vi.fn(() => ({ lt, eq })),
          };
        }),
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(insert).toHaveBeenCalledWith({
      stripe_event_id: "evt_123",
      event_type: "invoice.created",
    });
    expect(lt).toHaveBeenCalledTimes(1);

    mathRandomSpy.mockRestore();
  });

  it("stamps Stripe customer ownership metadata on checkout completion", async () => {
    const mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    const insert = vi.fn().mockResolvedValue({ error: null });
    const upsertStripeCustomer = vi.fn().mockResolvedValue(undefined);
    const customerRetrieve = vi.fn().mockResolvedValue({ id: "cus_123", metadata: {} });
    const customerUpdate = vi.fn().mockResolvedValue({ id: "cus_123" });

    vi.doMock("next/headers", () => ({
      headers: async () =>
        new Headers({
          "stripe-signature": "t=1,v1=test",
        }),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { STRIPE_WEBHOOK_SECRET: "whsec_test" },
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        webhooks: {
          constructEvent: vi.fn(() => ({
            id: "evt_checkout",
            created: 1_700_000_000,
            type: "checkout.session.completed",
            data: {
              object: {
                customer: "cus_123",
                client_reference_id: "user_123",
              },
            },
          })),
        },
        customers: {
          retrieve: customerRetrieve,
          update: customerUpdate,
        },
      },
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription: vi.fn(),
      upsertStripeCustomer,
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn((table: string) => {
          if (table !== "stripe_webhook_events") {
            throw new Error(`Unexpected table: ${table}`);
          }

          return {
            insert,
            delete: vi.fn(() => ({ lt: vi.fn(), eq: vi.fn() })),
          };
        }),
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(customerRetrieve).toHaveBeenCalledWith("cus_123");
    expect(customerUpdate).toHaveBeenCalledWith("cus_123", {
      metadata: { supabase_user_id: "user_123" },
    });
    expect(upsertStripeCustomer).toHaveBeenCalledWith("user_123", "cus_123");

    mathRandomSpy.mockRestore();
  });
});

