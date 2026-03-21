import { beforeEach, describe, expect, it, vi } from "vitest";

function createStripeSubscription(quantity: number) {
  return {
    id: "sub_123",
    created: 1_700_000_000,
    status: "active",
    customer: "cus_123",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          id: "si_123",
          quantity,
          price: { id: "price_growth" },
          current_period_start: 1_700_000_000,
          current_period_end: 1_700_086_400,
        },
      ],
    },
  };
}

function createSupabaseMock({
  liveSubscriptionId = "sub_123" as string | null,
  seatCounts = [2],
  subscriptionsError = null as { message: string } | null,
  membershipsError = null as { message: string } | null,
} = {}) {
  let seatCountCallIndex = 0;
  const maybeSingle = vi.fn().mockResolvedValue({
    data: liveSubscriptionId ? { stripe_subscription_id: liveSubscriptionId } : null,
    error: subscriptionsError,
  });
  const membershipsEq = vi.fn().mockImplementation(() => {
    const index = Math.min(seatCountCallIndex, seatCounts.length - 1);
    const count = seatCounts[index] ?? 0;
    seatCountCallIndex += 1;
    return Promise.resolve({ count, error: membershipsError });
  });

  return {
    maybeSingle,
    membershipsEq,
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
  };
}

describe("syncTeamSeatQuantity", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("syncs subscription metadata when quantity is already in sync", async () => {
    const update = vi.fn();
    const retrieve = vi.fn().mockResolvedValue(createStripeSubscription(2));
    const syncSubscription = vi.fn().mockResolvedValue(undefined);
    const supabaseMock = createSupabaseMock({ seatCounts: [2] });

    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: { retrieve, update },
      }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription,
    }));
    vi.doMock("@/lib/env", () => ({
      env: { STRIPE_SEAT_PRORATION_BEHAVIOR: undefined },
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: supabaseMock.from,
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

  it("returns no_live_subscription when there is no active subscription row", async () => {
    const update = vi.fn();
    const retrieve = vi.fn();
    const syncSubscription = vi.fn();
    const supabaseMock = createSupabaseMock({ liveSubscriptionId: null });

    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: { retrieve, update },
      }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription,
    }));
    vi.doMock("@/lib/env", () => ({
      env: { STRIPE_SEAT_PRORATION_BEHAVIOR: undefined },
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: supabaseMock.from,
      }),
    }));

    const { syncTeamSeatQuantity } = await import("./seats");
    const result = await syncTeamSeatQuantity("team_123");

    expect(result).toEqual({ updated: false, reason: "no_live_subscription" });
    expect(retrieve).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(syncSubscription).not.toHaveBeenCalled();
  });

  it("syncs quantity down to zero when team has no members", async () => {
    const updatedSubscription = createStripeSubscription(0);
    const update = vi.fn().mockResolvedValue(updatedSubscription);
    const retrieve = vi.fn().mockResolvedValue(createStripeSubscription(1));
    const syncSubscription = vi.fn().mockResolvedValue(undefined);
    const supabaseMock = createSupabaseMock({ seatCounts: [0, 0] });

    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: { retrieve, update },
      }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription,
    }));
    vi.doMock("@/lib/env", () => ({
      env: { STRIPE_SEAT_PRORATION_BEHAVIOR: undefined },
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: supabaseMock.from,
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

  it("passes configured proration behavior and idempotency key to stripe update", async () => {
    const update = vi.fn().mockResolvedValue(createStripeSubscription(4));
    const retrieve = vi.fn().mockResolvedValue(createStripeSubscription(2));
    const syncSubscription = vi.fn().mockResolvedValue(undefined);
    const supabaseMock = createSupabaseMock({ seatCounts: [4, 4] });

    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: { retrieve, update },
      }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription,
    }));
    vi.doMock("@/lib/env", () => ({
      env: { STRIPE_SEAT_PRORATION_BEHAVIOR: "none" },
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: supabaseMock.from,
      }),
    }));

    const { syncTeamSeatQuantity } = await import("./seats");
    await syncTeamSeatQuantity("team_123", { idempotencyKey: "seat-sync-1" });

    expect(update).toHaveBeenCalledWith(
      "sub_123",
      expect.objectContaining({
        proration_behavior: "none",
        items: [expect.objectContaining({ id: "si_123", quantity: 4 })],
      }),
      { idempotencyKey: "seat-sync-1" },
    );
  });

  it("runs a recount update when seat count changes during sync", async () => {
    const firstUpdateResult = createStripeSubscription(3);
    const secondUpdateResult = createStripeSubscription(5);
    const update = vi
      .fn()
      .mockResolvedValueOnce(firstUpdateResult)
      .mockResolvedValueOnce(secondUpdateResult);
    const retrieve = vi.fn().mockResolvedValue(createStripeSubscription(1));
    const syncSubscription = vi.fn().mockResolvedValue(undefined);
    const supabaseMock = createSupabaseMock({ seatCounts: [3, 5] });

    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: { retrieve, update },
      }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription,
    }));
    vi.doMock("@/lib/env", () => ({
      env: { STRIPE_SEAT_PRORATION_BEHAVIOR: "create_prorations" },
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: supabaseMock.from,
      }),
    }));

    const { syncTeamSeatQuantity } = await import("./seats");
    const result = await syncTeamSeatQuantity("team_123", { idempotencyKey: "recount-key" });

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(
      1,
      "sub_123",
      expect.objectContaining({
        items: [expect.objectContaining({ quantity: 3 })],
      }),
      { idempotencyKey: "recount-key" },
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      "sub_123",
      expect.objectContaining({
        items: [expect.objectContaining({ quantity: 5 })],
      }),
      { idempotencyKey: "recount-key:recount" },
    );
    expect(result).toEqual({
      updated: true,
      previousQuantity: 1,
      seatCount: 5,
    });
    expect(syncSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_123" }),
      expect.objectContaining({ eventCreatedUnix: expect.any(Number) }),
    );
  });

  it("falls back to create_prorations when proration env is invalid", async () => {
    const update = vi.fn().mockResolvedValue(createStripeSubscription(4));
    const retrieve = vi.fn().mockResolvedValue(createStripeSubscription(2));
    const syncSubscription = vi.fn().mockResolvedValue(undefined);
    const warn = vi.fn();
    const supabaseMock = createSupabaseMock({ seatCounts: [4, 4] });

    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: { retrieve, update },
      }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription,
    }));
    vi.doMock("@/lib/env", () => ({
      env: { STRIPE_SEAT_PRORATION_BEHAVIOR: "bad_value" },
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn, error: vi.fn(), info: vi.fn() },
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: supabaseMock.from,
      }),
    }));

    const { syncTeamSeatQuantity } = await import("./seats");
    await syncTeamSeatQuantity("team_123");

    expect(update).toHaveBeenCalledWith(
      "sub_123",
      expect.objectContaining({ proration_behavior: "create_prorations" }),
      undefined,
    );
    expect(warn).toHaveBeenCalledWith(
      "Invalid STRIPE_SEAT_PRORATION_BEHAVIOR configured; using create_prorations",
      expect.objectContaining({ configured: "bad_value" }),
    );
  });

  it("throws when stripe is not configured", async () => {
    const supabaseMock = createSupabaseMock({ seatCounts: [1] });
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => null,
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription: vi.fn(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { STRIPE_SEAT_PRORATION_BEHAVIOR: undefined },
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: supabaseMock.from,
      }),
    }));

    const { syncTeamSeatQuantity } = await import("./seats");
    await expect(syncTeamSeatQuantity("team_123")).rejects.toThrow("Stripe is not configured.");
  });

  it("throws when stripe retrieve fails", async () => {
    const update = vi.fn();
    const retrieve = vi.fn().mockRejectedValue(new Error("stripe retrieve failed"));
    const supabaseMock = createSupabaseMock({ seatCounts: [2] });
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: { retrieve, update },
      }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription: vi.fn(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { STRIPE_SEAT_PRORATION_BEHAVIOR: undefined },
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: supabaseMock.from,
      }),
    }));

    const { syncTeamSeatQuantity } = await import("./seats");
    await expect(syncTeamSeatQuantity("team_123")).rejects.toThrow("stripe retrieve failed");
  });

  it("throws when live subscription has no items", async () => {
    const update = vi.fn();
    const retrieve = vi.fn().mockResolvedValue({
      ...createStripeSubscription(2),
      items: { data: [] },
    });
    const supabaseMock = createSupabaseMock({ seatCounts: [2] });
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: { retrieve, update },
      }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription: vi.fn(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { STRIPE_SEAT_PRORATION_BEHAVIOR: undefined },
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: supabaseMock.from,
      }),
    }));

    const { syncTeamSeatQuantity } = await import("./seats");
    await expect(syncTeamSeatQuantity("team_123")).rejects.toThrow(
      "has no items and cannot be synchronized",
    );
  });
});
