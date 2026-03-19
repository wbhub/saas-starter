import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 409 when a live subscription already exists", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { stripe_subscription_id: "sub_live" }, error: null });
    const query = {
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
            data: {
              user: { id: "user_123", email: "user@example.com" },
            },
          }),
        },
        from: vi.fn(() => query),
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByKey: () => ({ key: "starter", priceId: "price_starter" }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: { retrieve: vi.fn(), create: vi.fn() },
        subscriptions: { list: vi.fn() },
        checkout: { sessions: { create: vi.fn() } },
      },
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      upsertStripeCustomer: vi.fn(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({ planKey: "starter" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "You already have an active subscription.",
    });
  });
});

