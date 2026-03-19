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
    const subscriptionsUpdate = vi
      .fn()
      .mockReturnValue(subscriptionsUpdateChain);
    const subscriptionsUpsert = vi.fn().mockResolvedValue({ error: null });
    const subscriptionsQuery = {
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
    expect(subscriptionsUpsert).toHaveBeenCalledOnce();
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
    const subscriptionsQuery = {
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
});
