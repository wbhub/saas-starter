import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function clearEnv() {
  delete process.env.BILLING_PROVIDER;
  delete process.env.APP_FREE_PLAN_ENABLED;
  delete process.env.STRIPE_SECRET_KEY;
}

describe("billing capabilities", () => {
  beforeEach(() => {
    vi.resetModules();
    clearEnv();
  });

  afterEach(() => {
    clearEnv();
  });

  it("defaults to free enabled and billing disabled", async () => {
    const { isFreePlanEnabled, getBillingProvider, isBillingEnabled } = await import("./capabilities");
    expect(isFreePlanEnabled()).toBe(true);
    expect(getBillingProvider()).toBe("none");
    expect(isBillingEnabled()).toBe(false);
  });

  it("enables billing only when BILLING_PROVIDER is stripe", async () => {
    process.env.BILLING_PROVIDER = "stripe";
    const { getBillingProvider, isBillingEnabled } = await import("./capabilities");
    expect(getBillingProvider()).toBe("stripe");
    expect(isBillingEnabled()).toBe(true);
  });

  it("keeps billing disabled for unknown provider values", async () => {
    process.env.BILLING_PROVIDER = "other";
    const { getBillingProvider, isBillingEnabled } = await import("./capabilities");
    expect(getBillingProvider()).toBe("none");
    expect(isBillingEnabled()).toBe(false);
  });
});
