import { env } from "@/lib/env";
import { PLAN_CATALOG, type PlanKey } from "@/lib/stripe/plans";

let cachedPlanKeyByPriceIdMap: ReadonlyMap<string, PlanKey> | null = null;

export function readConfiguredPriceIdForPlan(planKey: PlanKey): string | null {
  try {
    return env.getStripePriceId(planKey);
  } catch {
    return null;
  }
}

export function getPlanKeyByPriceIdMap(): ReadonlyMap<string, PlanKey> {
  if (cachedPlanKeyByPriceIdMap === null) {
    cachedPlanKeyByPriceIdMap = new Map(
      PLAN_CATALOG.flatMap((plan) => {
        const priceId = readConfiguredPriceIdForPlan(plan.key);
        return priceId ? [[priceId, plan.key] as const] : [];
      }),
    );
  }
  return cachedPlanKeyByPriceIdMap;
}

export function resolvePlanKeyByPriceId(priceId: string | null | undefined): PlanKey | null {
  const normalizedPriceId = priceId?.trim();
  if (!normalizedPriceId) {
    return null;
  }
  return getPlanKeyByPriceIdMap().get(normalizedPriceId) ?? null;
}
