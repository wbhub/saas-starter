import "server-only";
import {
  readConfiguredPriceIdForPlan,
  readConfiguredAnnualPriceIdForPlan,
} from "@/lib/stripe/price-id-lookup";
import { PLAN_CATALOG, type PlanInterval, type PlanKey } from "@/lib/stripe/plans";

export type Plan = {
  key: PlanKey;
  name: string;
  priceLabel: string;
  amountMonthly: number;
  amountAnnualMonthly?: number;
  description: string;
  popular?: boolean;
  features: string[];
  priceId: string | null;
  annualPriceId: string | null;
};

export const plans: Plan[] = [
  ...PLAN_CATALOG.map((plan) => ({
    ...plan,
    priceId: readConfiguredPriceIdForPlan(plan.key),
    annualPriceId: readConfiguredAnnualPriceIdForPlan(plan.key),
  })),
];

/** Whether any plan has an annual price configured. */
export const hasAnnualPricing = plans.some((p) => p.annualPriceId != null);

export function getPlanByKey(key: string) {
  return plans.find((plan) => plan.key === key);
}

export function getPlanByPriceId(priceId?: string | null) {
  if (!priceId) return null;
  return (
    plans.find(
      (plan) =>
        (plan.priceId != null && plan.priceId === priceId) ||
        (plan.annualPriceId != null && plan.annualPriceId === priceId),
    ) ?? null
  );
}

/** Returns the Stripe price ID for a plan + interval, or null if not configured. */
export function getPlanPriceId(
  planKey: PlanKey,
  interval: PlanInterval = "month",
): string | null {
  const plan = getPlanByKey(planKey);
  if (!plan) return null;
  return interval === "year" ? plan.annualPriceId : plan.priceId;
}
