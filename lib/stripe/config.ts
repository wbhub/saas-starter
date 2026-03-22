import "server-only";
import { readConfiguredPriceIdForPlan } from "@/lib/stripe/price-id-lookup";
import { PLAN_CATALOG, type PlanKey } from "@/lib/stripe/plans";

export type Plan = {
  key: PlanKey;
  name: string;
  priceLabel: string;
  amountMonthly: number;
  description: string;
  popular?: boolean;
  priceId: string | null;
};

function readStripePriceId(planKey: PlanKey) {
  return readConfiguredPriceIdForPlan(planKey);
}

export const plans: Plan[] = [
  ...PLAN_CATALOG.map((plan) => ({
    ...plan,
    priceId: readStripePriceId(plan.key),
  })),
];

export function getPlanByKey(key: string) {
  return plans.find((plan) => plan.key === key);
}

export function getPlanByPriceId(priceId?: string | null) {
  if (!priceId) return null;
  return plans.find((plan) => plan.priceId != null && plan.priceId === priceId) ?? null;
}
