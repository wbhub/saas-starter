import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 400 when Stripe signature is missing", async () => {
    vi.doMock("next/headers", () => ({
      headers: async () => new Headers(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { STRIPE_WEBHOOK_SECRET: "whsec_test" },
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        webhooks: { constructEvent: vi.fn() },
      },
    }));
    vi.doMock("@/lib/stripe/sync", () => ({
      syncSubscription: vi.fn(),
      upsertStripeCustomer: vi.fn(),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing Stripe signature",
    });
  });
});

