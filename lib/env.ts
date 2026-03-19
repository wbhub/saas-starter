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
  | "CRON_SECRET"
  | "INTERCOM_IDENTITY_SECRET"
  | "NEXT_PUBLIC_INTERCOM_APP_ID"
  | "TRUST_PROXY_HEADERS"
  | "TRUSTED_PROXY_HEADER_NAMES";

function ensureEnv(key: ServerEnvKey) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: OptionalEnvKey) {
  const value = process.env[key];
  return value?.trim() || undefined;
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
};
