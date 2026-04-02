import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/stripe/change-plan", () => {
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

  it("returns 503 when billing is disabled", async () => {
    vi.doMock("@/lib/billing/capabilities", () => ({
      isBillingEnabled: () => false,
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByKey: vi.fn(),
      getPlanPriceId: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/change-plan", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Billing is not configured for this deployment.",
    });
  });

  it("returns 409 when subscription ownership does not match user", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { stripe_subscription_id: "sub_123", status: "active" },
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
      getPlanByKey: () => ({ key: "growth", priceId: "price_growth" }),
      getPlanPriceId: () => "price_growth",
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription: vi.fn(),
    }));
    vi.doMock("@/lib/stripe/seat-sync-retries", () => ({
      enqueueSeatSyncRetry: vi.fn().mockResolvedValue(undefined),
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
            items: { data: [{ id: "si_123", price: { id: "price_starter" } }] },
          }),
          update: vi.fn(),
        },
        customers: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cus_123",
            metadata: { supabase_team_id: "other_team" },
          }),
        },
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/change-plan", {
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
  });

  it("preserves annual billing interval when changing plans", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: { stripe_subscription_id: "sub_123", status: "active" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { stripe_price_id: "price_growth_year", status: "active" },
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
    const update = vi.fn().mockResolvedValue({
      id: "sub_123",
      created: 1_700_000_000,
      status: "active",
      customer: "cus_123",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            id: "si_123",
            price: { id: "price_growth_year" },
            current_period_start: 1_700_000_000,
            current_period_end: 1_700_086_400,
          },
        ],
      },
    });
    const syncSubscription = vi.fn().mockResolvedValue(undefined);

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
        priceId: "price_growth",
        annualPriceId: "price_growth_year",
      }),
      getPlanPriceId: vi.fn((_planKey: string, interval: "month" | "year") =>
        interval === "year" ? "price_growth_year" : "price_growth",
      ),
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription,
    }));
    vi.doMock("@/lib/stripe/seat-sync-retries", () => ({
      enqueueSeatSyncRetry: vi.fn().mockResolvedValue(undefined),
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
          retrieve: vi
            .fn()
            .mockResolvedValueOnce({
              id: "sub_123",
              customer: "cus_123",
              items: {
                data: [
                  {
                    id: "si_123",
                    price: { id: "price_starter_year", recurring: { interval: "year" } },
                  },
                ],
              },
            })
            .mockResolvedValueOnce({
              id: "sub_123",
              customer: "cus_123",
              items: {
                data: [
                  {
                    id: "si_123",
                    price: { id: "price_starter_year", recurring: { interval: "year" } },
                  },
                ],
              },
            }),
          update,
        },
        customers: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cus_123",
            metadata: { supabase_team_id: "team_123" },
          }),
        },
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/change-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": "client-retry-1",
        },
        body: JSON.stringify({ planKey: "growth" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(
      "sub_123",
      {
        items: [{ id: "si_123", price: "price_growth_year", quantity: 1 }],
        proration_behavior: "create_prorations",
      },
      { idempotencyKey: "change-plan:team_123:growth:client-retry-1" },
    );
    expect(syncSubscription).toHaveBeenCalledOnce();
  });

  it("returns 200 when Stripe plan updates but local sync fails", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { stripe_subscription_id: "sub_123", status: "active" },
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
    const update = vi.fn().mockResolvedValue({
      id: "sub_123",
      created: 1_700_000_000,
      status: "active",
      customer: "cus_123",
      cancel_at_period_end: false,
      items: {
        data: [
          {
            id: "si_123",
            price: { id: "price_growth" },
            current_period_start: 1_700_000_000,
            current_period_end: 1_700_086_400,
          },
        ],
      },
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
      getPlanByKey: () => ({ key: "growth", priceId: "price_growth" }),
      getPlanPriceId: () => "price_growth",
    }));
    const enqueueSeatSyncRetry = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription: vi.fn().mockRejectedValue(new Error("db write failed")),
    }));
    vi.doMock("@/lib/stripe/seat-sync-retries", () => ({
      enqueueSeatSyncRetry,
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
          retrieve: vi
            .fn()
            .mockResolvedValueOnce({
              id: "sub_123",
              customer: "cus_123",
              items: { data: [{ id: "si_123", price: { id: "price_starter" } }] },
            })
            .mockResolvedValueOnce({
              id: "sub_123",
              customer: "cus_123",
              items: { data: [{ id: "si_123", price: { id: "price_starter" } }] },
            }),
          update,
        },
        customers: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cus_123",
            metadata: { supabase_team_id: "team_123" },
          }),
        },
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: "growth" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      warning: "Plan changed, but local billing sync failed. Please retry shortly.",
      planChanged: true,
    });
    expect(update).toHaveBeenCalledOnce();
    expect(enqueueSeatSyncRetry).toHaveBeenCalledWith({
      teamId: "team_123",
      source: "billing.plan.change",
      error: expect.any(Error),
    });
  });
});
