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
  | "STRIPE_PRO_PRICE_ID";

function ensureEnv(key: ServerEnvKey) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
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
};
