import "server-only";
import { env } from "@/lib/env";
import { type PlanKey } from "@/lib/stripe/plans";

export type Plan = {
  key: PlanKey;
  name: string;
  priceLabel: string;
  amountMonthly: number;
  description: string;
  priceId: string;
};

export const plans: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    priceLabel: "$25/mo",
    amountMonthly: 25,
    description: "For solo operators shipping their first subscription product.",
    priceId: env.STRIPE_STARTER_PRICE_ID,
  },
  {
    key: "growth",
    name: "Growth",
    priceLabel: "$50/mo",
    amountMonthly: 50,
    description: "For growing teams needing stronger automation and reporting.",
    priceId: env.STRIPE_GROWTH_PRICE_ID,
  },
  {
    key: "pro",
    name: "Pro",
    priceLabel: "$100/mo",
    amountMonthly: 100,
    description: "For advanced teams running revenue-critical product workflows.",
    priceId: env.STRIPE_PRO_PRICE_ID,
  },
];

export function getPlanByKey(key: string) {
  return plans.find((plan) => plan.key === key);
}

export function getPlanByPriceId(priceId?: string | null) {
  if (!priceId) return null;
  return plans.find((plan) => plan.priceId === priceId) ?? null;
}
