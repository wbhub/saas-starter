function readEnv(key: string) {
  return process.env[key]?.trim() || "";
}

export type BillingProvider = "none" | "stripe";

export function isFreePlanEnabled() {
  const configured = readEnv("APP_FREE_PLAN_ENABLED");
  if (!configured) {
    return true;
  }
  return configured === "true";
}

export function getBillingProvider() {
  const configured = readEnv("BILLING_PROVIDER");
  if (configured === "stripe") {
    return "stripe" as const;
  }
  return "none" as const;
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
