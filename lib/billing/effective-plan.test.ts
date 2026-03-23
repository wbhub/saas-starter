import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const FREE_PLAN_FLAG = "APP_FREE_PLAN_ENABLED";
const STARTER_PRICE_ID = "STRIPE_STARTER_PRICE_ID";
const GROWTH_PRICE_ID = "STRIPE_GROWTH_PRICE_ID";
const PRO_PRICE_ID = "STRIPE_PRO_PRICE_ID";

function clearPlanEnv() {
  delete process.env[FREE_PLAN_FLAG];
  delete process.env[STARTER_PRICE_ID];
  delete process.env[GROWTH_PRICE_ID];
  delete process.env[PRO_PRICE_ID];
}

describe("resolveEffectivePlanKey", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    clearPlanEnv();
  });

  afterEach(() => {
    clearPlanEnv();
  });

  it("returns free when no live paid subscription exists and free is enabled", async () => {
    process.env[FREE_PLAN_FLAG] = "true";

    const { resolveEffectivePlanKey } = await import("./effective-plan");
    const result = resolveEffectivePlanKey(null);

    expect(result).toBe("free");
  });

  it("defaults to free when free plan env var is unset", async () => {
    const { resolveEffectivePlanKey } = await import("./effective-plan");
    const result = resolveEffectivePlanKey(null);

    expect(result).toBe("free");
  });

  it("returns null when no live paid subscription exists and free is disabled", async () => {
    process.env[FREE_PLAN_FLAG] = "false";

    const { resolveEffectivePlanKey } = await import("./effective-plan");
    const result = resolveEffectivePlanKey(null);

    expect(result).toBeNull();
  });

  it("returns the paid plan for a live subscription with a known Stripe price", async () => {
    process.env[FREE_PLAN_FLAG] = "true";
    process.env[GROWTH_PRICE_ID] = "price_growth";

    const { resolveEffectivePlanKey } = await import("./effective-plan");
    const result = resolveEffectivePlanKey({
      status: "active",
      stripe_price_id: "price_growth",
    });

    expect(result).toBe("growth");
  });

  it("does not fall back to free when live subscription price is unknown", async () => {
    process.env[FREE_PLAN_FLAG] = "true";
    process.env[STARTER_PRICE_ID] = "price_starter";

    const { resolveEffectivePlanKey } = await import("./effective-plan");
    const result = resolveEffectivePlanKey({
      status: "active",
      stripe_price_id: "price_unmapped",
    });

    expect(result).toBeNull();
  });
});
