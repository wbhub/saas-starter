import { beforeEach, describe, expect, it, vi } from "vitest";

function createBaseSubscription(overrides?: Record<string, unknown>) {
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
          quantity: 2,
          price: { id: "price_growth" },
          current_period_start: 1_700_000_000,
          current_period_end: 1_700_086_400,
        },
      ],
    },
    ...overrides,
  };
}

function createAdminMock({
  mapping = { team_id: "team_123" } as { team_id: string } | null,
  mappingError = null as { message: string } | null,
  rpcData = true,
  rpcError = null as { message: string } | null,
  upsertError = null as { message: string } | null,
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: mapping,
    error: mappingError,
  });
  const upsert = vi.fn().mockResolvedValue({ error: upsertError });
  const rpc = vi.fn().mockResolvedValue({ data: rpcData, error: rpcError });
  const stripeCustomersQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle,
    upsert,
  };
  return {
    rpc,
    maybeSingle,
    upsert,
    from: vi.fn((table: string) => {
      if (table !== "stripe_customers") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return stripeCustomersQuery;
    }),
  };
}

describe("resolveTeamIdFromStripeCustomer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns the mapped team id when mapping exists", async () => {
    const adminMock = createAdminMock({
      mapping: { team_id: "team_from_db" },
    });
    const retrieve = vi.fn();

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: { retrieve },
      }),
    }));

    const { resolveTeamIdFromStripeCustomer } = await import("./sync");
    await expect(resolveTeamIdFromStripeCustomer("cus_123")).resolves.toBe("team_from_db");
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("falls back to stripe metadata team id when mapping is absent", async () => {
    const adminMock = createAdminMock({ mapping: null });
    const retrieve = vi.fn().mockResolvedValue({
      id: "cus_123",
      metadata: { supabase_team_id: "team_from_stripe" },
    });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: { retrieve },
      }),
    }));

    const { resolveTeamIdFromStripeCustomer } = await import("./sync");
    await expect(resolveTeamIdFromStripeCustomer("cus_123")).resolves.toBe("team_from_stripe");
    expect(retrieve).toHaveBeenCalledWith("cus_123");
  });

  it("returns null when stripe customer is deleted", async () => {
    const adminMock = createAdminMock({ mapping: null });
    const retrieve = vi.fn().mockResolvedValue({
      id: "cus_123",
      deleted: true,
    });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: { retrieve },
      }),
    }));

    const { resolveTeamIdFromStripeCustomer } = await import("./sync");
    await expect(resolveTeamIdFromStripeCustomer("cus_123")).resolves.toBeNull();
  });

  it("throws when stripe is required but not configured", async () => {
    const adminMock = createAdminMock({ mapping: null });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => null,
    }));

    const { resolveTeamIdFromStripeCustomer } = await import("./sync");
    await expect(resolveTeamIdFromStripeCustomer("cus_123")).rejects.toThrow(
      "Stripe is not configured.",
    );
  });

  it("throws when mapping query fails", async () => {
    const adminMock = createAdminMock({
      mapping: null,
      mappingError: { message: "db unavailable" },
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: { retrieve: vi.fn() },
      }),
    }));

    const { resolveTeamIdFromStripeCustomer } = await import("./sync");
    await expect(resolveTeamIdFromStripeCustomer("cus_123")).rejects.toThrow(
      "Failed to load stripe customer mapping: db unavailable",
    );
  });
});

describe("upsertStripeCustomer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("upserts team to customer mapping with team_id conflict key", async () => {
    const adminMock = createAdminMock();
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: { retrieve: vi.fn() },
      }),
    }));

    const { upsertStripeCustomer } = await import("./sync");
    await upsertStripeCustomer("team_123", "cus_123");

    expect(adminMock.upsert).toHaveBeenCalledWith(
      {
        team_id: "team_123",
        stripe_customer_id: "cus_123",
      },
      { onConflict: "team_id" },
    );
  });

  it("throws when upsert fails", async () => {
    const adminMock = createAdminMock({
      upsertError: { message: "write failed" },
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: { retrieve: vi.fn() },
      }),
    }));

    const { upsertStripeCustomer } = await import("./sync");
    await expect(upsertStripeCustomer("team_123", "cus_123")).rejects.toThrow(
      "Failed to upsert stripe customer: write failed",
    );
  });
});

describe("syncSubscription", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("maps subscription fields to atomic rpc payload", async () => {
    const adminMock = createAdminMock();
    const warn = vi.fn();

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: { retrieve: vi.fn() },
      }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        warn,
        error: vi.fn(),
        info: vi.fn(),
      },
    }));

    const { syncSubscription } = await import("./sync");
    await syncSubscription(createBaseSubscription() as never, {
      eventCreatedUnix: 1_700_000_050,
    });

    expect(warn).not.toHaveBeenCalledWith(
      "Ignoring untracked Stripe subscription status during sync",
      expect.anything(),
    );
    expect(adminMock.rpc).toHaveBeenCalledWith(
      "sync_stripe_subscription_atomic",
      expect.objectContaining({
        p_team_id: "team_123",
        p_stripe_customer_id: "cus_123",
        p_stripe_subscription_id: "sub_123",
        p_stripe_price_id: "price_growth",
        p_seat_quantity: 2,
        p_status: "active",
        p_cancel_at_period_end: false,
        p_stripe_event_created_at: "2023-11-14T22:14:10.000Z",
      }),
    );
  });

  it("handles missing period boundaries by writing null values", async () => {
    const adminMock = createAdminMock();
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: { retrieve: vi.fn() },
      }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    const { syncSubscription } = await import("./sync");
    await syncSubscription(
      createBaseSubscription({
        items: {
          data: [
            {
              id: "si_123",
              quantity: 2,
              price: { id: "price_growth" },
              current_period_start: undefined,
              current_period_end: null,
            },
          ],
        },
      }) as never,
    );
    expect(adminMock.rpc).toHaveBeenCalledWith(
      "sync_stripe_subscription_atomic",
      expect.objectContaining({
        p_current_period_start: null,
        p_current_period_end: null,
      }),
    );
  });

  it("ignores untracked subscription statuses", async () => {
    const adminMock = createAdminMock();
    const warn = vi.fn();
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: { retrieve: vi.fn() },
      }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        warn,
        error: vi.fn(),
        info: vi.fn(),
      },
    }));

    const { syncSubscription } = await import("./sync");
    await syncSubscription(
      createBaseSubscription({ status: "definitely_unknown_status" }) as never,
    );

    expect(adminMock.rpc).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "Ignoring untracked Stripe subscription status during sync",
      expect.objectContaining({
        subscriptionId: "sub_123",
        status: "definitely_unknown_status",
      }),
    );
  });

  it("skips sync when no team mapping can be resolved", async () => {
    const adminMock = createAdminMock({ mapping: null });
    const retrieve = vi.fn().mockResolvedValue({
      id: "cus_123",
      metadata: {},
    });
    const warn = vi.fn();
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: {
          retrieve,
        },
      }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn, error: vi.fn(), info: vi.fn() },
    }));

    const { syncSubscription } = await import("./sync");
    await syncSubscription(createBaseSubscription() as never);
    expect(retrieve).toHaveBeenCalledWith("cus_123");
    expect(adminMock.rpc).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "No team mapping found for Stripe customer during sync",
      expect.objectContaining({
        stripeCustomerId: "cus_123",
        subscriptionId: "sub_123",
      }),
    );
  });

  it("falls back to Stripe customer metadata during subscription sync when local mapping is absent", async () => {
    const adminMock = createAdminMock({ mapping: null });
    const retrieve = vi.fn().mockResolvedValue({
      id: "cus_123",
      metadata: { supabase_team_id: "team_from_stripe" },
    });
    const warn = vi.fn();
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: {
          retrieve,
        },
      }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn, error: vi.fn(), info: vi.fn() },
    }));

    const { syncSubscription } = await import("./sync");
    await syncSubscription(createBaseSubscription() as never, {
      eventCreatedUnix: 1_700_000_050,
    });

    expect(retrieve).toHaveBeenCalledWith("cus_123");
    expect(adminMock.rpc).toHaveBeenCalledWith(
      "sync_stripe_subscription_atomic",
      expect.objectContaining({
        p_team_id: "team_from_stripe",
        p_stripe_customer_id: "cus_123",
        p_stripe_subscription_id: "sub_123",
      }),
    );
    expect(warn).not.toHaveBeenCalledWith(
      "No team mapping found for Stripe customer during sync",
      expect.anything(),
    );
  });

  it("does not throw when rpc reports stale event was ignored", async () => {
    const adminMock = createAdminMock({ rpcData: false });
    const warn = vi.fn();

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: { retrieve: vi.fn() },
      }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn, error: vi.fn(), info: vi.fn() },
    }));

    const { syncSubscription } = await import("./sync");

    await expect(syncSubscription(createBaseSubscription() as never)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "Stripe subscription sync ignored stale event",
      expect.objectContaining({
        subscriptionId: "sub_123",
      }),
    );
  });

  it("throws when subscription rpc fails", async () => {
    const adminMock = createAdminMock({
      rpcError: { message: "rpc failed" },
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: { retrieve: vi.fn() },
      }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    const { syncSubscription } = await import("./sync");
    await expect(syncSubscription(createBaseSubscription() as never)).rejects.toThrow(
      "Failed to sync subscription transactionally: rpc failed",
    );
  });

  it("throws when subscription has no items", async () => {
    const adminMock = createAdminMock();
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: { retrieve: vi.fn() },
      }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    const { syncSubscription } = await import("./sync");
    await expect(
      syncSubscription(createBaseSubscription({ items: { data: [] } }) as never),
    ).rejects.toThrow("has no items and cannot be synchronized");
    expect(adminMock.rpc).not.toHaveBeenCalled();
  });

  it("does not use legacy supabase_user_id metadata to resolve team mapping", async () => {
    const adminMock = createAdminMock({ mapping: null });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminMock,
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        customers: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cus_123",
            metadata: { supabase_user_id: "user_abc" },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    const { syncSubscription } = await import("./sync");
    await syncSubscription(createBaseSubscription() as never);

    expect(adminMock.rpc).not.toHaveBeenCalled();
  });
});
