import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/stripe/preview-proration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/billing/capabilities", () => ({
      isBillingEnabled: () => true,
    }));
  });

  it("builds the preview from live Stripe subscription data", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        stripe_subscription_id: "sub_123",
        stripe_customer_id: "cus_cached",
        stripe_price_id: "price_starter",
        stripe_subscription_item_id: "si_cached",
        seat_quantity: 1,
      },
      error: null,
    });
    const subscriptionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle,
    };

    const getPlanPriceId = vi.fn((_planKey: string, interval: "month" | "year") =>
      interval === "year" ? "price_growth_year" : "price_growth",
    );
    const createPreview = vi.fn().mockResolvedValue({
      amount_due: 4500,
      currency: "usd",
    });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "user@example.com" } },
          }),
        },
        from: vi.fn(() => subscriptionsQuery),
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByKey: () => ({
        key: "growth",
        name: "Growth",
        priceId: "price_growth",
        annualPriceId: "price_growth_year",
      }),
      getPlanPriceId,
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/team-context", () => ({
      canManageTeamBilling: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: {
          retrieve: vi.fn().mockResolvedValue({
            id: "sub_123",
            customer: "cus_live",
            items: {
              data: [
                {
                  id: "si_live",
                  quantity: 3,
                  price: {
                    id: "price_starter_year",
                    recurring: { interval: "year" },
                  },
                },
              ],
            },
          }),
        },
        customers: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cus_live",
            metadata: { supabase_team_id: "team_123" },
          }),
        },
        invoices: {
          createPreview,
        },
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/preview-proration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: "growth" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      amountDue: 45,
      currency: "USD",
      isCredit: false,
      targetPlanName: "Growth",
    });
    expect(getPlanPriceId).toHaveBeenCalledWith("growth", "year");
    expect(createPreview).toHaveBeenCalledWith({
      customer: "cus_live",
      subscription: "sub_123",
      subscription_details: {
        items: [{ id: "si_live", price: "price_growth_year", quantity: 3 }],
        proration_behavior: "create_prorations",
      },
    });
  });

  it("returns 409 when the Stripe customer is not owned by the active team", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { stripe_subscription_id: "sub_123" },
      error: null,
    });
    const subscriptionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    const createPreview = vi.fn();

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "user@example.com" } },
          }),
        },
        from: vi.fn(() => subscriptionsQuery),
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByKey: () => ({ key: "growth", name: "Growth" }),
      getPlanPriceId: () => "price_growth",
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/team-context", () => ({
      canManageTeamBilling: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      getStripeServerClient: () => ({
        subscriptions: {
          retrieve: vi.fn().mockResolvedValue({
            id: "sub_123",
            customer: "cus_123",
            items: {
              data: [{ id: "si_123", quantity: 1, price: { id: "price_starter" } }],
            },
          }),
        },
        customers: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cus_123",
            metadata: { supabase_team_id: "other_team" },
          }),
        },
        invoices: {
          createPreview,
        },
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/preview-proration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: "growth" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Billing identity mismatch detected. Start a new checkout to re-link your account.",
    });
    expect(createPreview).not.toHaveBeenCalled();
  });
});
