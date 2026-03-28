import { beforeEach, describe, expect, it, vi } from "vitest";

const checkoutSessionRetrieve = vi.fn();
const subscriptionRetrieve = vi.fn();
const subscriptionsList = vi.fn();
const customerRetrieve = vi.fn();
const maybeSingle = vi.fn();
const syncSubscription = vi.fn();
const upsertStripeCustomer = vi.fn();
const loggerWarn = vi.fn();

vi.mock("@/lib/stripe/server", () => ({
  getStripeServerClient: () => ({
    checkout: {
      sessions: {
        retrieve: checkoutSessionRetrieve,
      },
    },
    subscriptions: {
      retrieve: subscriptionRetrieve,
      list: subscriptionsList,
    },
    customers: {
      retrieve: customerRetrieve,
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn((table: string) => {
      if (table !== "stripe_customers") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      };
    }),
  }),
}));

vi.mock("@/lib/stripe/sync", () => ({
  syncSubscription,
  upsertStripeCustomer,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: loggerWarn,
  },
}));

describe("syncCheckoutSuccessForTeam", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("syncs the exact checkout session subscription when the session belongs to the current team", async () => {
    checkoutSessionRetrieve.mockResolvedValue({
      id: "cs_123",
      customer: "cus_123",
      subscription: "sub_123",
      client_reference_id: "team_123",
      metadata: { supabase_team_id: "team_123" },
    });
    subscriptionRetrieve.mockResolvedValue({
      id: "sub_123",
      status: "active",
      customer: "cus_123",
      cancel_at_period_end: false,
      created: 1_700_000_000,
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

    const { syncCheckoutSuccessForTeam } = await import("./checkout-success");
    await expect(syncCheckoutSuccessForTeam("team_123", { sessionId: "cs_123" })).resolves.toEqual({
      synced: true,
      subscriptionId: "sub_123",
    });

    expect(upsertStripeCustomer).toHaveBeenCalledWith("team_123", "cus_123");
    expect(syncSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_123" }),
      expect.objectContaining({ eventCreatedUnix: expect.any(Number) }),
    );
  });

  it("falls back to the latest live customer subscription when the success URL has no session id", async () => {
    maybeSingle.mockResolvedValue({
      data: { stripe_customer_id: "cus_123" },
      error: null,
    });
    customerRetrieve.mockResolvedValue({
      id: "cus_123",
      metadata: { supabase_team_id: "team_123" },
    });
    subscriptionsList.mockResolvedValue({
      data: [
        {
          id: "sub_old",
          created: 1_700_000_000,
          status: "active",
        },
        {
          id: "sub_new",
          created: 1_700_000_100,
          status: "active",
        },
      ],
    });

    const { syncCheckoutSuccessForTeam } = await import("./checkout-success");
    await expect(syncCheckoutSuccessForTeam("team_123")).resolves.toEqual({
      synced: true,
      subscriptionId: "sub_new",
    });

    expect(subscriptionsList).toHaveBeenCalledWith({
      customer: "cus_123",
      status: "all",
      limit: 100,
    });
    expect(syncSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_new" }),
      expect.objectContaining({ eventCreatedUnix: expect.any(Number) }),
    );
  });

  it("refuses to sync a checkout session that belongs to another team", async () => {
    checkoutSessionRetrieve.mockResolvedValue({
      id: "cs_123",
      customer: "cus_123",
      subscription: "sub_123",
      client_reference_id: "team_other",
      metadata: { supabase_team_id: "team_other" },
    });

    const { syncCheckoutSuccessForTeam } = await import("./checkout-success");
    await expect(syncCheckoutSuccessForTeam("team_123", { sessionId: "cs_123" })).resolves.toEqual({
      synced: false,
      reason: "team_mismatch",
    });

    expect(syncSubscription).not.toHaveBeenCalled();
    expect(upsertStripeCustomer).not.toHaveBeenCalled();
  });
});
