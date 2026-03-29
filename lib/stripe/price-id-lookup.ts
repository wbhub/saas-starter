import { env } from "@/lib/env";
import { PLAN_CATALOG, type PlanInterval, type PlanKey } from "@/lib/stripe/plans";

let cachedPlanKeyByPriceIdMap: ReadonlyMap<string, PlanKey> | null = null;

export function readConfiguredPriceIdForPlan(planKey: PlanKey): string | null {
  try {
    return env.getStripePriceId(planKey);
  } catch {
    return null;
  }
}

export function readConfiguredAnnualPriceIdForPlan(planKey: PlanKey): string | null {
  return env.getStripeAnnualPriceId(planKey);
}

export function getPlanKeyByPriceIdMap(): ReadonlyMap<string, PlanKey> {
  if (cachedPlanKeyByPriceIdMap === null) {
    cachedPlanKeyByPriceIdMap = new Map(
      PLAN_CATALOG.flatMap((plan) => {
        const entries: [string, PlanKey][] = [];
        const monthlyPriceId = readConfiguredPriceIdForPlan(plan.key);
        if (monthlyPriceId) entries.push([monthlyPriceId, plan.key]);
        const annualPriceId = readConfiguredAnnualPriceIdForPlan(plan.key);
        if (annualPriceId) entries.push([annualPriceId, plan.key]);
        return entries;
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

export type PlanWithInterval = {
  planKey: PlanKey;
  interval: PlanInterval;
};

let cachedPlanWithIntervalByPriceIdMap: ReadonlyMap<string, PlanWithInterval> | null = null;

export function getPlanWithIntervalByPriceIdMap(): ReadonlyMap<string, PlanWithInterval> {
  if (cachedPlanWithIntervalByPriceIdMap === null) {
    cachedPlanWithIntervalByPriceIdMap = new Map(
      PLAN_CATALOG.flatMap((plan) => {
        const entries: [string, PlanWithInterval][] = [];
        const monthlyPriceId = readConfiguredPriceIdForPlan(plan.key);
        if (monthlyPriceId)
          entries.push([monthlyPriceId, { planKey: plan.key, interval: "month" }]);
        const annualPriceId = readConfiguredAnnualPriceIdForPlan(plan.key);
        if (annualPriceId) entries.push([annualPriceId, { planKey: plan.key, interval: "year" }]);
        return entries;
      }),
    );
  }
  return cachedPlanWithIntervalByPriceIdMap;
}

export function resolvePlanWithIntervalByPriceId(
  priceId: string | null | undefined,
): PlanWithInterval | null {
  const normalized = priceId?.trim();
  if (!normalized) return null;
  return getPlanWithIntervalByPriceIdMap().get(normalized) ?? null;
}
