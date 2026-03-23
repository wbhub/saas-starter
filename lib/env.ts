import {
  STRIPE_PLAN_PRICE_ID_ENV_KEYS,
  getStripePriceIdEnvKey,
  type PlanKey,
  type StripePriceIdEnvKey,
} from "@/lib/stripe/plans";
import { isBillingEnabled, isFreePlanEnabled } from "@/lib/billing/capabilities";

type StaticServerEnvKey =
  | "NEXT_PUBLIC_APP_URL"
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "STRIPE_SECRET_KEY"
  | "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
  | "STRIPE_WEBHOOK_SECRET"
  | "RESEND_API_KEY"
  | "RESEND_FROM_EMAIL"
  | "RESEND_SUPPORT_EMAIL";

type ServerEnvKey = StaticServerEnvKey | StripePriceIdEnvKey;

type OptionalEnvKey =
  | "OPENAI_API_KEY"
  | "ANTHROPIC_API_KEY"
  | "GOOGLE_GENERATIVE_AI_API_KEY"
  | "AI_PROVIDER"
  | "AI_PROVIDER_API_KEY"
  | "AI_ACCESS_MODE"
  | "AI_DEFAULT_MODEL"
  | "AI_DEFAULT_MONTHLY_TOKEN_BUDGET"
  | "AI_ALLOWED_MODALITIES"
  | "AI_MODEL_MODALITIES_MAP_JSON"
  | "AI_PLAN_RULES_JSON"
  | "AI_ALLOWED_SUBSCRIPTION_STATUSES"
  | "AI_PLAN_MODEL_MAP_JSON"
  | "AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON"
  | "AI_PLAN_MODALITIES_MAP_JSON"
  | "APP_FREE_PLAN_ENABLED"
  | "BILLING_PROVIDER"
  | "CRON_SECRET"
  | "INTERCOM_IDENTITY_SECRET"
  | "NEXT_PUBLIC_INTERCOM_APP_ID"
  | "TRUST_PROXY_HEADERS"
  | "TRUSTED_PROXY_HEADER_NAMES"
  | "STRIPE_SEAT_PRORATION_BEHAVIOR"
  | "TEAM_MAX_MEMBERS"
  | "UPSTASH_REDIS_REST_URL"
  | "UPSTASH_REDIS_REST_TOKEN"
  | "TRIGGER_SECRET_KEY"
  | "TRIGGER_PROJECT_REF";

const warnedMissingEnv = new Set<string>();
const SOFT_REQUIRED_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
 ] as const satisfies ReadonlyArray<ServerEnvKey>;
type SoftRequiredEnvKey = (typeof SOFT_REQUIRED_KEYS)[number];
type HardRequiredEnvKey = Exclude<ServerEnvKey, SoftRequiredEnvKey>;
const SOFT_REQUIRED_KEY_SET: ReadonlySet<ServerEnvKey> = new Set(SOFT_REQUIRED_KEYS);
const ENV_FALLBACKS: Partial<Record<ServerEnvKey, string>> = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_placeholder",
};

function ensureEnv(key: ServerEnvKey) {
  const value = process.env[key]?.trim();
  if (!value) {
    if (SOFT_REQUIRED_KEY_SET.has(key)) {
      if (!warnedMissingEnv.has(key)) {
        warnedMissingEnv.add(key);
        console.warn(`Missing optional runtime variable (using fallback): ${key}`);
      }
      return ENV_FALLBACKS[key] ?? "";
    }
    if (!warnedMissingEnv.has(key)) {
      warnedMissingEnv.add(key);
      console.error(`Missing required environment variable: ${key}`);
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: OptionalEnvKey) {
  const value = process.env[key];
  return value?.trim() || undefined;
}

const DEFAULT_APP_URL = "http://localhost:3000";

export function getAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) {
    return DEFAULT_APP_URL;
  }

  try {
    return new URL(configured).toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_APP_URL;
  }
}

const envBase = {
  get NEXT_PUBLIC_APP_URL() {
    return ensureEnv("NEXT_PUBLIC_APP_URL");
  },
  get NEXT_PUBLIC_SUPABASE_URL() {
    return ensureEnv("NEXT_PUBLIC_SUPABASE_URL");
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY() {
    return ensureEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return ensureEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  get OPENAI_API_KEY() {
    return optionalEnv("OPENAI_API_KEY");
  },
  get ANTHROPIC_API_KEY() {
    return optionalEnv("ANTHROPIC_API_KEY");
  },
  get GOOGLE_GENERATIVE_AI_API_KEY() {
    return optionalEnv("GOOGLE_GENERATIVE_AI_API_KEY");
  },
  get AI_PROVIDER() {
    return optionalEnv("AI_PROVIDER");
  },
  get AI_PROVIDER_API_KEY() {
    return optionalEnv("AI_PROVIDER_API_KEY");
  },
  get AI_ACCESS_MODE() {
    return optionalEnv("AI_ACCESS_MODE");
  },
  get AI_DEFAULT_MODEL() {
    return optionalEnv("AI_DEFAULT_MODEL");
  },
  get AI_DEFAULT_MONTHLY_TOKEN_BUDGET() {
    return optionalEnv("AI_DEFAULT_MONTHLY_TOKEN_BUDGET");
  },
  get AI_ALLOWED_MODALITIES() {
    return optionalEnv("AI_ALLOWED_MODALITIES");
  },
  get AI_MODEL_MODALITIES_MAP_JSON() {
    return optionalEnv("AI_MODEL_MODALITIES_MAP_JSON");
  },
  get AI_PLAN_RULES_JSON() {
    return optionalEnv("AI_PLAN_RULES_JSON");
  },
  get AI_ALLOWED_SUBSCRIPTION_STATUSES() {
    return optionalEnv("AI_ALLOWED_SUBSCRIPTION_STATUSES");
  },
  get AI_PLAN_MODEL_MAP_JSON() {
    return optionalEnv("AI_PLAN_MODEL_MAP_JSON");
  },
  get AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON() {
    return optionalEnv("AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON");
  },
  get AI_PLAN_MODALITIES_MAP_JSON() {
    return optionalEnv("AI_PLAN_MODALITIES_MAP_JSON");
  },
  get APP_FREE_PLAN_ENABLED() {
    return isFreePlanEnabled();
  },
  get BILLING_PROVIDER() {
    return optionalEnv("BILLING_PROVIDER");
  },
  get STRIPE_SECRET_KEY() {
    return ensureEnv("STRIPE_SECRET_KEY");
  },
  get NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY() {
    return ensureEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  },
  get STRIPE_WEBHOOK_SECRET() {
    return ensureEnv("STRIPE_WEBHOOK_SECRET");
  },
  getStripePriceId(planKey: PlanKey) {
    return ensureEnv(getStripePriceIdEnvKey(planKey));
  },
  get RESEND_API_KEY() {
    return ensureEnv("RESEND_API_KEY");
  },
  get RESEND_FROM_EMAIL() {
    return ensureEnv("RESEND_FROM_EMAIL");
  },
  get RESEND_SUPPORT_EMAIL() {
    return ensureEnv("RESEND_SUPPORT_EMAIL");
  },
  get INTERCOM_IDENTITY_SECRET() {
    return optionalEnv("INTERCOM_IDENTITY_SECRET");
  },
  get NEXT_PUBLIC_INTERCOM_APP_ID() {
    return optionalEnv("NEXT_PUBLIC_INTERCOM_APP_ID");
  },
  get TRUST_PROXY_HEADERS() {
    return optionalEnv("TRUST_PROXY_HEADERS") === "true";
  },
  get TRUSTED_PROXY_HEADER_NAMES() {
    return optionalEnv("TRUSTED_PROXY_HEADER_NAMES");
  },
  get CRON_SECRET() {
    return optionalEnv("CRON_SECRET");
  },
  get STRIPE_SEAT_PRORATION_BEHAVIOR() {
    return optionalEnv("STRIPE_SEAT_PRORATION_BEHAVIOR");
  },
  get TEAM_MAX_MEMBERS() {
    return optionalEnv("TEAM_MAX_MEMBERS");
  },
  get UPSTASH_REDIS_REST_URL() {
    return optionalEnv("UPSTASH_REDIS_REST_URL");
  },
  get UPSTASH_REDIS_REST_TOKEN() {
    return optionalEnv("UPSTASH_REDIS_REST_TOKEN");
  },
  get TRIGGER_SECRET_KEY() {
    return optionalEnv("TRIGGER_SECRET_KEY");
  },
  get TRIGGER_PROJECT_REF() {
    return optionalEnv("TRIGGER_PROJECT_REF");
  },
};

const stripePriceEnvGetterDescriptors = Object.fromEntries(
  STRIPE_PLAN_PRICE_ID_ENV_KEYS.map((key) => [
    key,
    {
      get() {
        return ensureEnv(key);
      },
      enumerable: true,
    } satisfies PropertyDescriptor,
  ]),
) as Record<StripePriceIdEnvKey, PropertyDescriptor>;

export const env = Object.defineProperties(envBase, stripePriceEnvGetterDescriptors) as typeof envBase & {
  readonly [K in StripePriceIdEnvKey]: string;
};

const requiredStripePriceIdGetters: Record<StripePriceIdEnvKey, true> = Object.fromEntries(
  STRIPE_PLAN_PRICE_ID_ENV_KEYS.map((key) => [key, true]),
) as Record<StripePriceIdEnvKey, true>;

const CORE_REQUIRED_ENV_GETTERS: Readonly<
  Record<
    Exclude<
      HardRequiredEnvKey,
      | "STRIPE_SECRET_KEY"
      | "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
      | "STRIPE_WEBHOOK_SECRET"
      | StripePriceIdEnvKey
      | "RESEND_API_KEY"
      | "RESEND_FROM_EMAIL"
      | "RESEND_SUPPORT_EMAIL"
    >,
    true
  >
> = {
  SUPABASE_SERVICE_ROLE_KEY: true,
};

const BILLING_REQUIRED_ENV_GETTERS: Readonly<
  Record<
    "STRIPE_SECRET_KEY" | "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" | "STRIPE_WEBHOOK_SECRET" | StripePriceIdEnvKey,
    true
  >
> = {
  STRIPE_SECRET_KEY: true,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: true,
  STRIPE_WEBHOOK_SECRET: true,
  ...requiredStripePriceIdGetters,
};

const BILLING_REQUIRED_ENV_KEYS = Object.keys(BILLING_REQUIRED_ENV_GETTERS) as Array<
  "STRIPE_SECRET_KEY" | "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" | "STRIPE_WEBHOOK_SECRET" | StripePriceIdEnvKey
>;

function hasValue(key: string) {
  return (process.env[key]?.trim() || "").length > 0;
}

export function validateRequiredEnvAtBoot() {
  for (const key of Object.keys(CORE_REQUIRED_ENV_GETTERS) as Array<
    keyof typeof CORE_REQUIRED_ENV_GETTERS
  >) {
    // Access each required env getter to fail fast on startup misconfiguration.
    void env[key];
  }

  if (!isBillingEnabled()) {
    if (hasValue("STRIPE_SECRET_KEY")) {
      throw new Error(
        "Invalid billing configuration: STRIPE_SECRET_KEY is set but BILLING_PROVIDER is not 'stripe'.",
      );
    }
    if (!isFreePlanEnabled()) {
      throw new Error(
        "Invalid billing configuration: either set APP_FREE_PLAN_ENABLED=true or configure Stripe billing.",
      );
    }
    return;
  }

  const missingBillingKeys = BILLING_REQUIRED_ENV_KEYS.filter((key) => !hasValue(key));
  if (missingBillingKeys.length > 0) {
    throw new Error(
      `Missing required Stripe billing environment variables: ${missingBillingKeys.join(", ")}`,
    );
  }

  for (const key of BILLING_REQUIRED_ENV_KEYS as HardRequiredEnvKey[]) {
    // Access billing env getters after preflight to keep behavior consistent.
    void env[key];
  }
}
