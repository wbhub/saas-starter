export const PLAN_KEYS = ["starter", "growth", "pro"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const PLAN_LABELS: Record<PlanKey, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};
