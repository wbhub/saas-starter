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

export type PlanCatalogEntry = {
  key: PlanKey;
  name: string;
  priceLabel: string;
  amountMonthly: number;
  description: string;
  popular?: boolean;
};

export function getStripePriceIdEnvKey(planKey: PlanKey): StripePriceIdEnvKey {
  return `STRIPE_${planKey.toUpperCase()}_PRICE_ID` as StripePriceIdEnvKey;
}

export const STRIPE_PLAN_PRICE_ID_ENV_KEYS: readonly StripePriceIdEnvKey[] = PLAN_KEYS.map(
  getStripePriceIdEnvKey,
);

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    key: "starter",
    name: "Starter",
    priceLabel: "$25/mo",
    amountMonthly: 25,
    description: "Perfect for founders validating a new product.",
  },
  {
    key: "growth",
    name: "Growth",
    priceLabel: "$50/mo",
    amountMonthly: 50,
    description: "For teams scaling activation and retention.",
    popular: true,
  },
  {
    key: "pro",
    name: "Pro",
    priceLabel: "$100/mo",
    amountMonthly: 100,
    description: "For businesses that need reliability at scale.",
  },
];

export const PLAN_LABELS: Record<PlanKey, string> = Object.fromEntries(
  PLAN_CATALOG.map((plan) => [plan.key, plan.name] as const),
) as Record<PlanKey, string>;
