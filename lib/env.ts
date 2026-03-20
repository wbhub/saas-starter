type ServerEnvKey =
  | "NEXT_PUBLIC_APP_URL"
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "STRIPE_SECRET_KEY"
  | "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
  | "STRIPE_WEBHOOK_SECRET"
  | "STRIPE_STARTER_PRICE_ID"
  | "STRIPE_GROWTH_PRICE_ID"
  | "STRIPE_PRO_PRICE_ID"
  | "RESEND_API_KEY"
  | "RESEND_FROM_EMAIL"
  | "RESEND_SUPPORT_EMAIL";

type OptionalEnvKey =
  | "OPENAI_API_KEY"
  | "CRON_SECRET"
  | "INTERCOM_IDENTITY_SECRET"
  | "NEXT_PUBLIC_INTERCOM_APP_ID"
  | "TRUST_PROXY_HEADERS"
  | "TRUSTED_PROXY_HEADER_NAMES"
  | "STRIPE_SEAT_PRORATION_BEHAVIOR";

const warnedMissingEnv = new Set<string>();
const SOFT_REQUIRED_KEYS: ReadonlySet<ServerEnvKey> = new Set([
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);
const ENV_FALLBACKS: Partial<Record<ServerEnvKey, string>> = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
};

function ensureEnv(key: ServerEnvKey) {
  const value = process.env[key]?.trim();
  if (!value) {
    if (SOFT_REQUIRED_KEYS.has(key)) {
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

export const env = {
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
  get STRIPE_SECRET_KEY() {
    return ensureEnv("STRIPE_SECRET_KEY");
  },
  get NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY() {
    return ensureEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  },
  get STRIPE_WEBHOOK_SECRET() {
    return ensureEnv("STRIPE_WEBHOOK_SECRET");
  },
  get STRIPE_STARTER_PRICE_ID() {
    return ensureEnv("STRIPE_STARTER_PRICE_ID");
  },
  get STRIPE_GROWTH_PRICE_ID() {
    return ensureEnv("STRIPE_GROWTH_PRICE_ID");
  },
  get STRIPE_PRO_PRICE_ID() {
    return ensureEnv("STRIPE_PRO_PRICE_ID");
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
};
