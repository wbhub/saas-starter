import "server-only";
import { env } from "@/lib/env";
import { PLAN_CATALOG, type PlanKey } from "@/lib/stripe/plans";

export type Plan = {
  key: PlanKey;
  name: string;
  priceLabel: string;
  amountMonthly: number;
  description: string;
  priceId: string;
};

export const plans: Plan[] = [
  ...PLAN_CATALOG.map((plan) => ({
    ...plan,
    priceId:
      plan.key === "starter"
        ? env.STRIPE_STARTER_PRICE_ID
        : plan.key === "growth"
          ? env.STRIPE_GROWTH_PRICE_ID
          : env.STRIPE_PRO_PRICE_ID,
  })),
];

export function getPlanByKey(key: string) {
  return plans.find((plan) => plan.key === key);
}

export function getPlanByPriceId(priceId?: string | null) {
  if (!priceId) return null;
  return plans.find((plan) => plan.priceId === priceId) ?? null;
}
