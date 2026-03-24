/**
 * Lightweight billing-provider detection that reads `process.env` directly.
 * This module exists to break the circular dependency between `lib/env.ts`
 * and `lib/billing/capabilities.ts`. Both may import from here safely.
 *
 * Listed in the `process.env` allowlist (see CONVENTIONS.md).
 */

export type BillingProvider = "none" | "stripe";

function readEnv(key: string) {
  return process.env[key]?.trim() || "";
}

export function isFreePlanEnabled() {
  const configured = readEnv("APP_FREE_PLAN_ENABLED");
  if (!configured) {
    return true;
  }
  return configured === "true";
}

export function getBillingProvider(): BillingProvider {
  const configured = readEnv("BILLING_PROVIDER");
  if (configured === "stripe") {
    return "stripe";
  }
  return "none";
}

export function isStripeConfiguredForRuntime() {
  return readEnv("STRIPE_SECRET_KEY").length > 0;
}

export function isBillingEnabled() {
  return getBillingProvider() === "stripe";
}

export function getBillingMode() {
  return isBillingEnabled() ? "enabled" : "disabled";
}
