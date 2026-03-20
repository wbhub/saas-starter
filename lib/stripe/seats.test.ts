import { beforeEach, describe, expect, it, vi } from "vitest";

describe("syncTeamSeatQuantity", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("syncs subscription metadata when quantity is already in sync", async () => {
    const update = vi.fn();
    const retrieve = vi.fn().mockResolvedValue({
      id: "sub_123",
      created: 1_700_000_000,
      status: "active",
      customer: "cus_123",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            id: "si_123",
            quantity: 2,
            price: { id: "price_growth" },
            current_period_start: 1_700_000_000,
            current_period_end: 1_700_086_400,
          },
        ],
      },
    });
    const syncSubscription = vi.fn().mockResolvedValue(undefined);
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { stripe_subscription_id: "sub_123" },
      error: null,
    });
    const membershipsEq = vi.fn().mockResolvedValue({ count: 2, error: null });

    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: { retrieve, update },
      }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription,
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn((table: string) => {
          if (table === "subscriptions") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle,
            };
          }
          if (table === "team_memberships") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: membershipsEq,
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));

    const { syncTeamSeatQuantity } = await import("./seats");
    const result = await syncTeamSeatQuantity("team_123");

    expect(result).toEqual({ updated: false, reason: "already_in_sync" });
    expect(update).not.toHaveBeenCalled();
    expect(syncSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_123" }),
      expect.objectContaining({ eventCreatedUnix: expect.any(Number) }),
    );
  });

  it("syncs quantity down to zero when team has no members", async () => {
    const updatedSubscription = {
      id: "sub_123",
      items: { data: [{ id: "si_123", quantity: 0 }] },
    };
    const update = vi.fn().mockResolvedValue(updatedSubscription);
    const retrieve = vi.fn().mockResolvedValue({
      id: "sub_123",
      created: 1_700_000_000,
      status: "active",
      customer: "cus_123",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            id: "si_123",
            quantity: 1,
            price: { id: "price_growth" },
            current_period_start: 1_700_000_000,
            current_period_end: 1_700_086_400,
          },
        ],
      },
    });
    const syncSubscription = vi.fn().mockResolvedValue(undefined);
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { stripe_subscription_id: "sub_123" },
      error: null,
    });
    const membershipsEq = vi.fn().mockResolvedValue({ count: 0, error: null });

    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: { retrieve, update },
      }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription,
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn((table: string) => {
          if (table === "subscriptions") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle,
            };
          }
          if (table === "team_memberships") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: membershipsEq,
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));

    const { syncTeamSeatQuantity } = await import("./seats");
    const result = await syncTeamSeatQuantity("team_123");

    expect(result).toEqual({
      updated: true,
      previousQuantity: 1,
      seatCount: 0,
    });
    expect(update).toHaveBeenCalledWith(
      "sub_123",
      expect.objectContaining({
        items: [expect.objectContaining({ id: "si_123", quantity: 0 })],
      }),
      undefined,
    );
    expect(syncSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_123" }),
      expect.objectContaining({ eventCreatedUnix: expect.any(Number) }),
    );
  });
});
