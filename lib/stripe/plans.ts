export const PLAN_KEYS = ["starter", "growth", "pro"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const PLAN_LABELS: Record<PlanKey, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};

export type PlanCatalogEntry = {
  key: PlanKey;
  name: string;
  priceLabel: string;
  amountMonthly: number;
  description: string;
};

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
  },
  {
    key: "pro",
    name: "Pro",
    priceLabel: "$100/mo",
    amountMonthly: 100,
    description: "For businesses that need reliability at scale.",
  },
];
