import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function clearEnv() {
  delete process.env.BILLING_PROVIDER;
  delete process.env.APP_FREE_PLAN_ENABLED;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_STARTER_PRICE_ID;
  delete process.env.STRIPE_GROWTH_PRICE_ID;
  delete process.env.STRIPE_PRO_PRICE_ID;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.RESEND_SUPPORT_EMAIL;
}

function seedCoreRequiredEnv() {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role";
  process.env.RESEND_API_KEY = "re_test";
  process.env.RESEND_FROM_EMAIL = "Test <test@example.com>";
  process.env.RESEND_SUPPORT_EMAIL = "support@example.com";
}

describe("free-only billing runtime", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    clearEnv();
    seedCoreRequiredEnv();
    process.env.BILLING_PROVIDER = "none";
    process.env.APP_FREE_PLAN_ENABLED = "true";
  });

  afterEach(() => {
    clearEnv();
  });

  it("boots and keeps billing-critical paths in no-op mode", async () => {
    const { validateRequiredEnvAtBoot } = await import("@/lib/env");
    expect(() => validateRequiredEnvAtBoot()).not.toThrow();

    const { syncTeamSeatQuantity } = await import("@/lib/stripe/seats");
    await expect(syncTeamSeatQuantity("team_123")).resolves.toEqual({
      updated: false,
      reason: "billing_disabled",
    });

    const { reconcileTeamSeatQuantities } = await import("@/lib/stripe/seat-reconcile");
    await expect(reconcileTeamSeatQuantities()).resolves.toEqual({
      scannedTeams: 0,
      synced: 0,
      failed: 0,
      queuedRetries: 0,
      discoveredFromStripe: 0,
      stripePagesScanned: 0,
    });
  });
});
