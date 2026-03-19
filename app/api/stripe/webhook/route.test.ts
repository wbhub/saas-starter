import { beforeEach, describe, expect, it, vi } from "vitest";

function createWebhookEventsTableMocks() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { completed_at: null, claim_expires_at: null },
    error: null,
  });
  const select = vi.fn(() => ({
    eq: vi.fn().mockReturnValue({
      maybeSingle,
    }),
  }));

  const deleteLt = vi.fn().mockResolvedValue({ error: null });
  const deleteByEqIsLt = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn(() => ({
    not: vi.fn().mockReturnValue({ lt: deleteLt }),
    is: vi.fn().mockReturnValue({ lt: deleteLt }),
    eq: vi.fn().mockReturnValue({
      is: vi.fn().mockReturnValue({ lt: deleteByEqIsLt }),
    }),
  }));

  const updateEqIs = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({
    eq: vi.fn().mockReturnValue({
      is: updateEqIs,
    }),
  }));

  const from = vi.fn((table: string) => {
    if (table !== "stripe_webhook_events") {
      throw new Error(`Unexpected table: ${table}`);
    }
    return {
      insert,
      select,
      delete: del,
      update,
    };
  });

  return {
    from,
    insert,
    maybeSingle,
    deleteLt,
    deleteByEqIsLt,
    updateEqIs,
  };
}

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
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing Stripe signature",
    });
  });

  it("enforces application/json content type", async () => {
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
      }),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "Content-Type must be application/json.",
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
        headers: { "Content-Type": "application/json" },
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
    const tableMocks = createWebhookEventsTableMocks();

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
      createAdminClient: () => ({ from: tableMocks.from }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(tableMocks.insert).toHaveBeenCalledWith({
      stripe_event_id: "evt_123",
      event_type: "invoice.created",
      processed_at: expect.any(String),
      claim_expires_at: expect.any(String),
      completed_at: null,
    });
    // Prune runs both completed and stale-claim cleanup.
    expect(tableMocks.deleteLt).toHaveBeenCalledTimes(2);
    // Event is marked complete after successful processing.
    expect(tableMocks.updateEqIs).toHaveBeenCalledTimes(1);

    mathRandomSpy.mockRestore();
  });

  it("stamps Stripe customer ownership metadata on checkout completion", async () => {
    const mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    const tableMocks = createWebhookEventsTableMocks();
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
      createAdminClient: () => ({ from: tableMocks.from }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    expect(tableMocks.updateEqIs).toHaveBeenCalledTimes(1);

    mathRandomSpy.mockRestore();
  });
});

