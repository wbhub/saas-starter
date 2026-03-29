import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const upsert = vi.fn();
const customerCreate = vi.fn();
const customerRetrieve = vi.fn();
const customerUpdate = vi.fn();

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
        upsert,
      };
    }),
  }),
}));

describe("getOrCreateStripeCustomerForTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates and stores a Stripe customer for first-time teams", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    customerCreate.mockResolvedValue({
      id: "cus_new",
    });
    upsert.mockResolvedValue({
      error: null,
    });

    const { getOrCreateStripeCustomerForTeam } = await import("./customer");
    await expect(
      getOrCreateStripeCustomerForTeam({
        stripe: {
          customers: {
            create: customerCreate,
            retrieve: customerRetrieve,
            update: customerUpdate,
          },
        } as never,
        teamId: "team_123",
        userId: "user_123",
        email: "owner@example.com",
        idempotencyKey: "checkout:team_123:starter:token:customer",
      }),
    ).resolves.toBe("cus_new");

    expect(customerCreate).toHaveBeenCalledWith(
      {
        email: "owner@example.com",
        metadata: {
          supabase_team_id: "team_123",
          supabase_user_id: "user_123",
        },
      },
      { idempotencyKey: "checkout:team_123:starter:token:customer" },
    );
    expect(upsert).toHaveBeenCalledWith(
      {
        team_id: "team_123",
        stripe_customer_id: "cus_new",
      },
      { onConflict: "team_id" },
    );
  });

  it("backfills ownership metadata onto an existing Stripe customer", async () => {
    maybeSingle.mockResolvedValue({
      data: { stripe_customer_id: "cus_existing" },
      error: null,
    });
    customerRetrieve.mockResolvedValue({
      id: "cus_existing",
      email: null,
      metadata: {},
    });

    const { getOrCreateStripeCustomerForTeam } = await import("./customer");
    await expect(
      getOrCreateStripeCustomerForTeam({
        stripe: {
          customers: {
            create: customerCreate,
            retrieve: customerRetrieve,
            update: customerUpdate,
          },
        } as never,
        teamId: "team_123",
        userId: "user_123",
        email: "owner@example.com",
        idempotencyKey: "checkout:team_123:starter:token:customer",
      }),
    ).resolves.toBe("cus_existing");

    expect(customerUpdate).toHaveBeenCalledWith("cus_existing", {
      email: "owner@example.com",
      metadata: {
        supabase_team_id: "team_123",
        supabase_user_id: "user_123",
      },
    });
    expect(customerCreate).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
