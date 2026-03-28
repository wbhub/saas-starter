export const ALL_SUBSCRIPTION_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;

export type SubscriptionStatus = (typeof ALL_SUBSCRIPTION_STATUSES)[number];

/** Statuses that represent an in-force subscription (excludes terminal states). */
export const LIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
];

/** Statuses that are allowed to access paid AI features. */
export const AI_ELIGIBLE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
];

export const PLAN_KEYS = ["starter", "growth", "pro"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];
export type StripePriceIdEnvKey = `STRIPE_${Uppercase<PlanKey>}_PRICE_ID`;

export const PLAN_INTERVALS = ["month", "year"] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];

export type PlanCatalogEntry = {
  key: PlanKey;
  name: string;
  priceLabel: string;
  amountMonthly: number;
  /** Monthly equivalent when billed annually (e.g. 20% discount). */
  amountAnnualMonthly?: number;
  description: string;
  popular?: boolean;
  /** Feature bullet points shown on onboarding plan cards. */
  features: string[];
};

export type StripeAnnualPriceIdEnvKey =
  `STRIPE_${Uppercase<PlanKey>}_ANNUAL_PRICE_ID`;

export function getStripeAnnualPriceIdEnvKey(
  planKey: PlanKey,
): StripeAnnualPriceIdEnvKey {
  return `STRIPE_${planKey.toUpperCase()}_ANNUAL_PRICE_ID` as StripeAnnualPriceIdEnvKey;
}

export const STRIPE_PLAN_ANNUAL_PRICE_ID_ENV_KEYS: readonly StripeAnnualPriceIdEnvKey[] =
  PLAN_KEYS.map(getStripeAnnualPriceIdEnvKey);

/** Features shown on the free plan card during onboarding. */
export const FREE_PLAN_FEATURES: readonly string[] = [
  "1 team member",
  "Basic dashboard access",
  "Community support",
];

export function getStripePriceIdEnvKey(planKey: PlanKey): StripePriceIdEnvKey {
  return `STRIPE_${planKey.toUpperCase()}_PRICE_ID` as StripePriceIdEnvKey;
}

export const STRIPE_PLAN_PRICE_ID_ENV_KEYS: readonly StripePriceIdEnvKey[] =
  PLAN_KEYS.map(getStripePriceIdEnvKey);

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    key: "starter",
    name: "Starter",
    priceLabel: "$25/mo",
    amountMonthly: 25,
    amountAnnualMonthly: 20,
    description: "Auth, teams, and billing for founders validating a new product.",
    features: [
      "Up to 5 team members",
      "Real-time data syncing",
      "Basic integrations",
    ],
  },
  {
    key: "growth",
    name: "Growth",
    priceLabel: "$50/mo",
    amountMonthly: 50,
    amountAnnualMonthly: 40,
    description: "Add AI access, seat scaling, and usage tracking as your team grows.",
    popular: true,
    features: [
      "AI-powered features",
      "Advanced analytics",
      "Priority email support",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    priceLabel: "$100/mo",
    amountMonthly: 100,
    amountAnnualMonthly: 80,
    description: "Full platform with priority support, audit logging, and advanced integrations.",
    features: [
      "Unlimited team members",
      "Audit logging",
      "Dedicated support",
    ],
  },
];

export const PLAN_LABELS: Record<PlanKey, string> = Object.fromEntries(
  PLAN_CATALOG.map((plan) => [plan.key, plan.name] as const),
) as Record<PlanKey, string>;
