import { beforeEach, describe, expect, it, vi } from "vitest";

function createAdminMock(
  teamMapping: { team_id: string } | null = { team_id: "team_123" },
) {
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

  const stripeCustomersQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: teamMapping, error: null }),
  };

  const from = vi.fn((table: string) => {
    if (table === "stripe_customers") {
      return stripeCustomersQuery;
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { from, rpc };
}

describe("syncSubscription", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("calls atomic rpc with correct params for active subscription", async () => {
    const adminMock = createAdminMock();

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: { retrieve: vi.fn() },
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

    expect(adminMock.rpc).toHaveBeenCalledWith(
      "sync_stripe_subscription_atomic",
      expect.objectContaining({
        p_team_id: "team_123",
        p_stripe_customer_id: "cus_123",
        p_stripe_subscription_id: "sub_new",
        p_stripe_price_id: "price_starter",
        p_seat_quantity: 1,
        p_status: "active",
        p_stripe_subscription_created_at: "2023-11-14T22:15:00.000Z",
        p_cancel_at_period_end: false,
      }),
    );
  });

  it("calls atomic rpc for canceled subscriptions", async () => {
    const adminMock = createAdminMock();

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: { retrieve: vi.fn() },
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

    expect(adminMock.rpc).toHaveBeenCalledWith(
      "sync_stripe_subscription_atomic",
      expect.objectContaining({
        p_status: "canceled",
        p_cancel_at_period_end: true,
      }),
    );
  });

  it("passes event timestamp through to rpc", async () => {
    const adminMock = createAdminMock();

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: { retrieve: vi.fn() },
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

    expect(adminMock.rpc).toHaveBeenCalledWith(
      "sync_stripe_subscription_atomic",
      expect.objectContaining({
        p_stripe_event_created_at: "2023-11-14T22:13:20.000Z",
      }),
    );
  });

  it("delegates equal-timestamp ordering to atomic rpc", async () => {
    const adminMock = createAdminMock();

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: { retrieve: vi.fn() },
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

    expect(adminMock.rpc).toHaveBeenCalledOnce();
    expect(adminMock.rpc).toHaveBeenCalledWith(
      "sync_stripe_subscription_atomic",
      expect.objectContaining({
        p_stripe_subscription_id: "sub_equal",
        p_stripe_event_created_at: "2023-11-14T22:13:20.000Z",
      }),
    );
  });

  it("skips sync when no user mapping exists", async () => {
    const adminMock = createAdminMock(null);

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cus_orphan",
            metadata: {},
          }),
        },
      },
    }));

    const { syncSubscription } = await import("./sync");

    await syncSubscription({
      id: "sub_orphan",
      created: 1_700_000_000,
      status: "active",
      customer: "cus_orphan",
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

    expect(adminMock.rpc).not.toHaveBeenCalled();
  });

  it("does not throw when rpc reports stale event was ignored", async () => {
    const adminMock = createAdminMock();
    adminMock.rpc.mockResolvedValue({ data: false, error: null });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: { retrieve: vi.fn() },
      },
    }));
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { syncSubscription } = await import("./sync");

    await expect(
      syncSubscription({
        id: "sub_stale_ignored",
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
      } as never),
    ).resolves.toBeUndefined();

    expect(consoleWarn).toHaveBeenCalledWith(
      "Stripe subscription sync ignored stale event",
      expect.objectContaining({
        subscriptionId: "sub_stale_ignored",
      }),
    );
    consoleWarn.mockRestore();
  });

  it("does not fall back to supabase_user_id for team resolution", async () => {
    const adminMock = createAdminMock(null);

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cus_user_only",
            metadata: { supabase_user_id: "user_abc" },
          }),
        },
      },
    }));

    const { syncSubscription } = await import("./sync");

    await syncSubscription({
      id: "sub_user_only",
      created: 1_700_000_000,
      status: "active",
      customer: "cus_user_only",
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

    expect(adminMock.rpc).not.toHaveBeenCalled();
  });

  it("throws when subscription has no items", async () => {
    const adminMock = createAdminMock();

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: { retrieve: vi.fn() },
      },
    }));

    const { syncSubscription } = await import("./sync");

    await expect(
      syncSubscription({
        id: "sub_missing_items",
        created: 1_700_000_000,
        status: "active",
        customer: "cus_123",
        cancel_at_period_end: false,
        items: { data: [] },
      } as never),
    ).rejects.toThrow("has no items and cannot be synchronized");

    expect(adminMock.rpc).not.toHaveBeenCalled();
  });
});
