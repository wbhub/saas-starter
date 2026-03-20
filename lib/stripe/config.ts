import "server-only";
import { PLAN_CATALOG, type PlanKey } from "@/lib/stripe/plans";

export type Plan = {
  key: PlanKey;
  name: string;
  priceLabel: string;
  amountMonthly: number;
  description: string;
  priceId: string | null;
};

function readStripePriceId(key: "STRIPE_STARTER_PRICE_ID" | "STRIPE_GROWTH_PRICE_ID" | "STRIPE_PRO_PRICE_ID") {
  return process.env[key]?.trim() || null;
}

export const plans: Plan[] = [
  ...PLAN_CATALOG.map((plan) => ({
    ...plan,
    priceId:
      plan.key === "starter"
        ? readStripePriceId("STRIPE_STARTER_PRICE_ID")
        : plan.key === "growth"
          ? readStripePriceId("STRIPE_GROWTH_PRICE_ID")
          : readStripePriceId("STRIPE_PRO_PRICE_ID"),
  })),
];

export function getPlanByKey(key: string) {
  return plans.find((plan) => plan.key === key);
}

export function getPlanByPriceId(priceId?: string | null) {
  if (!priceId) return null;
  return plans.find((plan) => plan.priceId != null && plan.priceId === priceId) ?? null;
}
