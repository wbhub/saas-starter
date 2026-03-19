import { beforeEach, describe, expect, it, vi } from "vitest";

describe("syncSubscription", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("reconciles existing live subscriptions before upsert", async () => {
    const stripeCustomersMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { user_id: "user_123" }, error: null });
    const stripeCustomersUpsert = vi.fn().mockResolvedValue({ error: null });
    const stripeCustomersQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: stripeCustomersMaybeSingle,
      upsert: stripeCustomersUpsert,
    };

    const closeLiveIn = vi.fn().mockResolvedValue({ error: null });
    const subscriptionsUpdateChain = {
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: closeLiveIn,
    };
    const subscriptionsUpdate = vi.fn().mockReturnValue(subscriptionsUpdateChain);
    const subscriptionsUpsert = vi.fn().mockResolvedValue({ error: null });
    const existingRowMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const competingIn = vi.fn().mockResolvedValue({ data: [], error: null });
    const subscriptionsSelect = vi.fn((columns: string) => {
      if (columns === "stripe_event_created_at") {
        return {
          eq: vi.fn().mockReturnThis(),
          maybeSingle: existingRowMaybeSingle,
        };
      }
      if (columns === "stripe_subscription_id,stripe_subscription_created_at") {
        return {
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          in: competingIn,
        };
      }
      throw new Error(`Unexpected select: ${columns}`);
    });
    const subscriptionsQuery = {
      select: subscriptionsSelect,
      update: subscriptionsUpdate,
      upsert: subscriptionsUpsert,
    };

    const from = vi.fn((table: string) => {
      if (table === "stripe_customers") {
        return stripeCustomersQuery;
      }
      if (table === "subscriptions") {
        return subscriptionsQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: {
          retrieve: vi.fn(),
        },
      },
    }));

    const { syncSubscription } = await import("./sync");

    await syncSubscription({
      id: "sub_new",
      created: 1_700_000_100,
      status: "active",
      customer: "cus_123",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: "price_starter" },
            current_period_start: 1_700_000_000,
            current_period_end: 1_700_086_400,
          },
        ],
      },
    } as never);

    expect(subscriptionsUpdate).toHaveBeenCalled();
    expect(closeLiveIn).toHaveBeenCalledOnce();
    expect(subscriptionsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_subscription_id: "sub_new",
        stripe_subscription_created_at: "2023-11-14T22:15:00.000Z",
      }),
      { onConflict: "stripe_subscription_id" },
    );
  });

  it("skips reconciliation update for canceled subscriptions", async () => {
    const stripeCustomersQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: "user_123" }, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };

    const subscriptionsUpdate = vi.fn();
    const subscriptionsUpsert = vi.fn().mockResolvedValue({ error: null });
    const existingRowMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const subscriptionsSelect = vi.fn((columns: string) => {
      if (columns === "stripe_event_created_at") {
        return {
          eq: vi.fn().mockReturnThis(),
          maybeSingle: existingRowMaybeSingle,
        };
      }
      throw new Error(`Unexpected select: ${columns}`);
    });
    const subscriptionsQuery = {
      select: subscriptionsSelect,
      update: subscriptionsUpdate,
      upsert: subscriptionsUpsert,
    };

    const from = vi.fn((table: string) => {
      if (table === "stripe_customers") {
        return stripeCustomersQuery;
      }
      if (table === "subscriptions") {
        return subscriptionsQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: {
          retrieve: vi.fn(),
        },
      },
    }));

    const { syncSubscription } = await import("./sync");

    await syncSubscription({
      id: "sub_old",
      created: 1_700_000_000,
      status: "canceled",
      customer: "cus_123",
      cancel_at_period_end: true,
      items: {
        data: [
          {
            price: { id: "price_starter" },
            current_period_start: 1_700_000_000,
            current_period_end: 1_700_086_400,
          },
        ],
      },
    } as never);

    expect(subscriptionsUpdate).not.toHaveBeenCalled();
    expect(subscriptionsUpsert).toHaveBeenCalledOnce();
  });

  it("ignores out-of-order stale webhook snapshots", async () => {
    const stripeCustomersQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: "user_123" }, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };

    const subscriptionsUpdate = vi.fn();
    const subscriptionsUpsert = vi.fn().mockResolvedValue({ error: null });
    const existingRowMaybeSingle = vi.fn().mockResolvedValue({
      data: { stripe_event_created_at: "2026-03-19T10:00:00.000Z" },
      error: null,
    });
    const subscriptionsSelect = vi.fn((columns: string) => {
      if (columns === "stripe_event_created_at") {
        return {
          eq: vi.fn().mockReturnThis(),
          maybeSingle: existingRowMaybeSingle,
        };
      }
      throw new Error(`Unexpected select: ${columns}`);
    });
    const subscriptionsQuery = {
      select: subscriptionsSelect,
      update: subscriptionsUpdate,
      upsert: subscriptionsUpsert,
    };

    const from = vi.fn((table: string) => {
      if (table === "stripe_customers") {
        return stripeCustomersQuery;
      }
      if (table === "subscriptions") {
        return subscriptionsQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: {
          retrieve: vi.fn(),
        },
      },
    }));

    const { syncSubscription } = await import("./sync");

    await syncSubscription(
      {
        id: "sub_stale",
        created: 1_700_000_000,
        status: "active",
        customer: "cus_123",
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: { id: "price_starter" },
              current_period_start: 1_700_000_000,
              current_period_end: 1_700_086_400,
            },
          ],
        },
      } as never,
      {
        eventCreatedUnix: 1_700_000_000,
      },
    );

    expect(subscriptionsUpdate).not.toHaveBeenCalled();
    expect(subscriptionsUpsert).not.toHaveBeenCalled();
  });

  it("processes equal-timestamp webhook snapshots for same subscription", async () => {
    const stripeCustomersQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: "user_123" }, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };

    const closeLiveIn = vi.fn().mockResolvedValue({ error: null });
    const subscriptionsUpdateChain = {
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: closeLiveIn,
    };
    const subscriptionsUpdate = vi.fn().mockReturnValue(subscriptionsUpdateChain);
    const subscriptionsUpsert = vi.fn().mockResolvedValue({ error: null });
    const existingRowMaybeSingle = vi.fn().mockResolvedValue({
      data: { stripe_event_created_at: "2023-11-14T22:13:20.000Z" },
      error: null,
    });
    const subscriptionsSelect = vi.fn((columns: string) => {
      if (columns === "stripe_event_created_at") {
        return {
          eq: vi.fn().mockReturnThis(),
          maybeSingle: existingRowMaybeSingle,
        };
      }
      if (columns === "stripe_subscription_id,stripe_subscription_created_at") {
        return {
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      throw new Error(`Unexpected select: ${columns}`);
    });
    const subscriptionsQuery = {
      select: subscriptionsSelect,
      update: subscriptionsUpdate,
      upsert: subscriptionsUpsert,
    };

    const from = vi.fn((table: string) => {
      if (table === "stripe_customers") {
        return stripeCustomersQuery;
      }
      if (table === "subscriptions") {
        return subscriptionsQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: {
          retrieve: vi.fn(),
        },
      },
    }));

    const { syncSubscription } = await import("./sync");

    await syncSubscription(
      {
        id: "sub_equal",
        created: 1_700_000_000,
        status: "active",
        customer: "cus_123",
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: { id: "price_starter" },
              current_period_start: 1_700_000_000,
              current_period_end: 1_700_086_400,
            },
          ],
        },
      } as never,
      {
        eventCreatedUnix: 1_700_000_000,
      },
    );

    expect(subscriptionsUpdate).toHaveBeenCalledOnce();
    expect(closeLiveIn).toHaveBeenCalledOnce();
    expect(subscriptionsUpsert).toHaveBeenCalledOnce();
  });

  it("does not promote an older duplicate live subscription", async () => {
    const stripeCustomersQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { user_id: "user_123" }, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };

    const subscriptionsUpdate = vi.fn();
    const subscriptionsUpsert = vi.fn().mockResolvedValue({ error: null });
    const existingRowMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const competingIn = vi.fn().mockResolvedValue({
      data: [
        {
          stripe_subscription_id: "sub_real",
          stripe_subscription_created_at: "2026-03-19T10:00:00.000Z",
        },
      ],
      error: null,
    });
    const subscriptionsSelect = vi.fn((columns: string) => {
      if (columns === "stripe_event_created_at") {
        return {
          eq: vi.fn().mockReturnThis(),
          maybeSingle: existingRowMaybeSingle,
        };
      }
      if (columns === "stripe_subscription_id,stripe_subscription_created_at") {
        return {
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          in: competingIn,
        };
      }
      throw new Error(`Unexpected select: ${columns}`);
    });
    const subscriptionsQuery = {
      select: subscriptionsSelect,
      update: subscriptionsUpdate,
      upsert: subscriptionsUpsert,
    };

    const from = vi.fn((table: string) => {
      if (table === "stripe_customers") {
        return stripeCustomersQuery;
      }
      if (table === "subscriptions") {
        return subscriptionsQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: {
          retrieve: vi.fn(),
        },
      },
    }));

    const { syncSubscription } = await import("./sync");

    await syncSubscription({
      id: "sub_duplicate",
      created: 1_700_000_000,
      status: "active",
      customer: "cus_123",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: "price_starter" },
            current_period_start: 1_700_000_000,
            current_period_end: 1_700_086_400,
          },
        ],
      },
    } as never);

    expect(subscriptionsUpdate).not.toHaveBeenCalled();
    expect(subscriptionsUpsert).not.toHaveBeenCalled();
  });
});
