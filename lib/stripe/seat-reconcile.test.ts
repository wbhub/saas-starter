import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("reconcileTeamSeatQuantities", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("BILLING_PROVIDER", "stripe");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns no-op summary when billing is disabled", async () => {
    vi.resetModules();
    vi.stubEnv("BILLING_PROVIDER", "none");

    const { reconcileTeamSeatQuantities } = await import("./seat-reconcile");
    const result = await reconcileTeamSeatQuantities();

    expect(result).toEqual({
      scannedTeams: 0,
      synced: 0,
      failed: 0,
      queuedRetries: 0,
      discoveredFromStripe: 0,
      stripePagesScanned: 0,
    });
  });

  it("paginates database teams and includes Stripe discovery", async () => {
    const syncTeamSeatQuantity = vi.fn().mockResolvedValue({ updated: true });
    const resolveTeamIdFromStripeCustomer = vi.fn().mockResolvedValue("team_c");
    const list = vi.fn().mockResolvedValue({
      data: [
        { id: "sub_1", status: "active", customer: "cus_1" },
        { id: "sub_2", status: "canceled", customer: "cus_2" },
      ],
      has_more: false,
    });

    const range = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ team_id: "team_a" }, { team_id: "team_b" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [],
        error: null,
      });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn(() => ({
            returns: range,
          })),
        })),
      }),
    }));
    vi.doMock("@/lib/stripe/seats", () => ({
      syncTeamSeatQuantity,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: {
          list,
        },
      }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      resolveTeamIdFromStripeCustomer,
    }));
    vi.doMock("@/lib/stripe/seat-sync-retries", () => ({
      listDueSeatSyncRetryTeamIds: vi.fn().mockResolvedValue([]),
      enqueueSeatSyncRetry: vi.fn().mockResolvedValue(undefined),
      clearSeatSyncRetry: vi.fn().mockResolvedValue(undefined),
    }));

    const { reconcileTeamSeatQuantities } = await import("./seat-reconcile");
    const result = await reconcileTeamSeatQuantities({
      batchSize: 2,
      includeStripeDiscovery: true,
      stripePageLimit: 1,
    });

    expect(result).toEqual({
      scannedTeams: 3,
      synced: 3,
      failed: 0,
      queuedRetries: 0,
      discoveredFromStripe: 1,
      stripePagesScanned: 1,
    });
    expect(syncTeamSeatQuantity).toHaveBeenCalledTimes(3);
    expect(list).toHaveBeenCalledWith({ status: "all", limit: 100 });
    expect(resolveTeamIdFromStripeCustomer).toHaveBeenCalledWith("cus_1");
  });

  it("can skip Stripe discovery", async () => {
    const syncTeamSeatQuantity = vi.fn().mockResolvedValue({ updated: true });
    const range = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ team_id: "team_a" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [],
        error: null,
      });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn(() => ({
            returns: range,
          })),
        })),
      }),
    }));
    vi.doMock("@/lib/stripe/seats", () => ({
      syncTeamSeatQuantity,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: {
          list: vi.fn(),
        },
      }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      resolveTeamIdFromStripeCustomer: vi.fn(),
    }));
    vi.doMock("@/lib/stripe/seat-sync-retries", () => ({
      listDueSeatSyncRetryTeamIds: vi.fn().mockResolvedValue([]),
      enqueueSeatSyncRetry: vi.fn().mockResolvedValue(undefined),
      clearSeatSyncRetry: vi.fn().mockResolvedValue(undefined),
    }));

    const { reconcileTeamSeatQuantities } = await import("./seat-reconcile");
    const result = await reconcileTeamSeatQuantities({
      batchSize: 100,
      includeStripeDiscovery: false,
    });

    expect(result).toEqual({
      scannedTeams: 1,
      synced: 1,
      failed: 0,
      queuedRetries: 0,
      discoveredFromStripe: 0,
      stripePagesScanned: 0,
    });
  });

  it("processes due retry queue teams", async () => {
    const syncTeamSeatQuantity = vi.fn().mockResolvedValue({ updated: true });
    const listDueSeatSyncRetryTeamIds = vi.fn().mockResolvedValue(["team_retry"]);
    const clearSeatSyncRetry = vi.fn().mockResolvedValue(undefined);
    const range = vi.fn().mockResolvedValueOnce({
      data: [],
      error: null,
    });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range: vi.fn(() => ({
            returns: range,
          })),
        })),
      }),
    }));
    vi.doMock("@/lib/stripe/seats", () => ({
      syncTeamSeatQuantity,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: {
          list: vi.fn(),
        },
      }),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      resolveTeamIdFromStripeCustomer: vi.fn(),
    }));
    vi.doMock("@/lib/stripe/seat-sync-retries", () => ({
      listDueSeatSyncRetryTeamIds,
      enqueueSeatSyncRetry: vi.fn().mockResolvedValue(undefined),
      clearSeatSyncRetry,
    }));

    const { reconcileTeamSeatQuantities } = await import("./seat-reconcile");
    const result = await reconcileTeamSeatQuantities({
      includeStripeDiscovery: false,
      retryBatchSize: 5,
    });

    expect(result).toEqual({
      scannedTeams: 1,
      synced: 1,
      failed: 0,
      queuedRetries: 1,
      discoveredFromStripe: 0,
      stripePagesScanned: 0,
    });
    expect(listDueSeatSyncRetryTeamIds).toHaveBeenCalledWith(5);
    expect(syncTeamSeatQuantity).toHaveBeenCalledWith("team_retry", {
      idempotencyKey: expect.stringMatching(/^seat-reconcile:\d+:team_retry:0$/),
    });
    expect(clearSeatSyncRetry).toHaveBeenCalledWith("team_retry");
  });
});
