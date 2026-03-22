import { PLAN_CATALOG, getStripePriceIdEnvKey, type PlanKey } from "@/lib/stripe/plans";

export function readConfiguredPriceIdForPlan(planKey: PlanKey): string | null {
  return process.env[getStripePriceIdEnvKey(planKey)]?.trim() || null;
}

export function getPlanKeyByPriceIdMap(): ReadonlyMap<string, PlanKey> {
  return new Map(
    PLAN_CATALOG.flatMap((plan) => {
      const priceId = readConfiguredPriceIdForPlan(plan.key);
      return priceId ? [[priceId, plan.key] as const] : [];
    }),
  );
}

export function resolvePlanKeyByPriceId(priceId: string | null | undefined): PlanKey | null {
  const normalizedPriceId = priceId?.trim();
  if (!normalizedPriceId) {
    return null;
  }
  return getPlanKeyByPriceIdMap().get(normalizedPriceId) ?? null;
}
