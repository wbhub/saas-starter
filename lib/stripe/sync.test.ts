import { beforeEach, describe, expect, it, vi } from "vitest";

function createSubscription(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "sub_123",
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
    ...overrides,
  } as never;
}

describe("syncSubscription", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("sends normalized payload to atomic sync RPC", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { user_id: "user_123" }, error: null });
    const from = vi.fn((table: string) => {
      if (table !== "stripe_customers") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      };
    });
    const rpc = vi.fn().mockResolvedValue({ error: null });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from, rpc }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: {
          retrieve: vi.fn(),
        },
      },
    }));

    const { syncSubscription } = await import("./sync");
    await syncSubscription(createSubscription(), {
      eventCreatedUnix: 1_710_806_400,
    });

    expect(rpc).toHaveBeenCalledWith("sync_stripe_subscription_atomic", {
      p_user_id: "user_123",
      p_stripe_customer_id: "cus_123",
      p_stripe_subscription_id: "sub_123",
      p_stripe_price_id: "price_starter",
      p_status: "active",
      p_stripe_subscription_created_at: "2023-11-14T22:13:20.000Z",
      p_current_period_start: "2023-11-14T22:13:20.000Z",
      p_current_period_end: "2023-11-15T22:13:20.000Z",
      p_cancel_at_period_end: false,
      p_stripe_event_created_at: "2024-03-19T00:00:00.000Z",
    });
  });

  it("falls back to Stripe customer metadata when mapping is missing", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const from = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    }));
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const customerRetrieve = vi
      .fn()
      .mockResolvedValue({ id: "cus_123", metadata: { supabase_user_id: "user_456" } });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from, rpc }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: {
          retrieve: customerRetrieve,
        },
      },
    }));

    const { syncSubscription } = await import("./sync");
    await syncSubscription(createSubscription());

    expect(customerRetrieve).toHaveBeenCalledWith("cus_123");
    expect(rpc).toHaveBeenCalledWith(
      "sync_stripe_subscription_atomic",
      expect.objectContaining({
        p_user_id: "user_456",
      }),
    );
  });

  it("ignores stale events that have an unknown status", async () => {
    const from = vi.fn();
    const rpc = vi.fn();

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from, rpc }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: {
          retrieve: vi.fn(),
        },
      },
    }));

    const { syncSubscription } = await import("./sync");
    await syncSubscription(createSubscription({ status: "bogus_status" }));

    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("skips sync when subscription has no line items", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { user_id: "user_123" }, error: null });
    const from = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    }));
    const rpc = vi.fn().mockResolvedValue({ error: null });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from, rpc }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: {
          retrieve: vi.fn(),
        },
      },
    }));

    const { syncSubscription } = await import("./sync");
    await syncSubscription(createSubscription({ items: { data: [] } }));

    expect(rpc).not.toHaveBeenCalled();
  });

  it("throws when RPC sync fails", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { user_id: "user_123" }, error: null });
    const from = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    }));
    const rpc = vi.fn().mockResolvedValue({
      error: { message: "rpc failed" },
    });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from, rpc }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: {
          retrieve: vi.fn(),
        },
      },
    }));

    const { syncSubscription } = await import("./sync");

    await expect(syncSubscription(createSubscription())).rejects.toThrow(
      "Failed to sync subscription transactionally: rpc failed",
    );
  });
});
