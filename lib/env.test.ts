import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CORE_ENV_KEYS = ["SUPABASE_SERVICE_ROLE_KEY"] as const;
const PUBLIC_RUNTIME_ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const STRIPE_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_STARTER_PRICE_ID",
  "STRIPE_GROWTH_PRICE_ID",
  "STRIPE_PRO_PRICE_ID",
] as const;

function seedCoreRequiredEnv() {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role";
}

function seedPublicRuntimeEnv() {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
}

function clearEnv() {
  for (const key of [
    ...CORE_ENV_KEYS,
    ...PUBLIC_RUNTIME_ENV_KEYS,
    ...STRIPE_ENV_KEYS,
    "APP_FREE_PLAN_ENABLED",
    "BILLING_PROVIDER",
  ]) {
    delete process.env[key];
  }
}

describe("validateRequiredEnvAtBoot", () => {
  beforeEach(() => {
    vi.resetModules();
    clearEnv();
    seedCoreRequiredEnv();
    seedPublicRuntimeEnv();
  });

  afterEach(() => {
    clearEnv();
  });

  it("allows free-only mode without Stripe keys", async () => {
    process.env.APP_FREE_PLAN_ENABLED = "true";

    const { validateRequiredEnvAtBoot } = await import("./env");
    expect(() => validateRequiredEnvAtBoot()).not.toThrow();
  });

  it("does not require Resend env vars at boot", async () => {
    process.env.APP_FREE_PLAN_ENABLED = "true";
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.RESEND_SUPPORT_EMAIL;

    const { validateRequiredEnvAtBoot } = await import("./env");
    expect(() => validateRequiredEnvAtBoot()).not.toThrow();
  });

  it("fails when billing is disabled and free mode is disabled", async () => {
    process.env.APP_FREE_PLAN_ENABLED = "false";

    const { validateRequiredEnvAtBoot } = await import("./env");
    expect(() => validateRequiredEnvAtBoot()).toThrow(
      "Invalid billing configuration: either set APP_FREE_PLAN_ENABLED=true or configure Stripe billing.",
    );
  });

  it("requires Stripe companion env vars when Stripe secret key is present", async () => {
    process.env.APP_FREE_PLAN_ENABLED = "true";
    process.env.BILLING_PROVIDER = "stripe";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";

    const { validateRequiredEnvAtBoot } = await import("./env");
    expect(() => validateRequiredEnvAtBoot()).toThrow(
      "Missing required Stripe billing environment variables: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_STARTER_PRICE_ID, STRIPE_GROWTH_PRICE_ID, STRIPE_PRO_PRICE_ID",
    );
  });

  it("passes when billing is enabled and all Stripe vars are configured", async () => {
    process.env.APP_FREE_PLAN_ENABLED = "false";
    process.env.BILLING_PROVIDER = "stripe";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
    process.env.STRIPE_GROWTH_PRICE_ID = "price_growth";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro";

    const { validateRequiredEnvAtBoot } = await import("./env");
    expect(() => validateRequiredEnvAtBoot()).not.toThrow();
  });

  it("fails when Stripe secret key is set but BILLING_PROVIDER is not stripe", async () => {
    process.env.APP_FREE_PLAN_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";

    const { validateRequiredEnvAtBoot } = await import("./env");
    expect(() => validateRequiredEnvAtBoot()).toThrow(
      "Invalid billing configuration: STRIPE_SECRET_KEY is set but BILLING_PROVIDER is not 'stripe'.",
    );
  });

  it("fails when public runtime env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;

    const { validateRequiredEnvAtBoot } = await import("./env");
    expect(() => validateRequiredEnvAtBoot()).toThrow(
      "Missing required public runtime environment variables: NEXT_PUBLIC_APP_URL",
    );
  });

  it("fails when public runtime URL env vars are invalid", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not a url";

    const { validateRequiredEnvAtBoot } = await import("./env");
    expect(() => validateRequiredEnvAtBoot()).toThrow(
      "Invalid URL environment variable: NEXT_PUBLIC_SUPABASE_URL",
    );
  });
});
