import { env } from "@/lib/env";
import { resolvePlanKeyByPriceId } from "@/lib/stripe/price-id-lookup";
import {
  PAID_ENTITLEMENT_SUBSCRIPTION_STATUSES,
  type PlanKey,
  type SubscriptionStatus,
} from "@/lib/stripe/plans";

export type EffectivePlanKey = "free" | PlanKey;

type SubscriptionPlanInput = {
  status?: SubscriptionStatus | null;
  stripe_price_id?: string | null;
};

function isPaidEntitlementSubscriptionStatus(
  status: SubscriptionStatus | null | undefined,
): status is SubscriptionStatus {
  if (!status) {
    return false;
  }
  return PAID_ENTITLEMENT_SUBSCRIPTION_STATUSES.includes(status);
}

export function resolveEffectivePlanKey(
  subscription: SubscriptionPlanInput | null | undefined,
): EffectivePlanKey | null {
  if (isPaidEntitlementSubscriptionStatus(subscription?.status)) {
    const paidPlanKey = resolvePlanKeyByPriceId(subscription?.stripe_price_id);
    if (paidPlanKey) {
      return paidPlanKey;
    }

    // Paid subscription exists but price ID is unknown to app config.
    // Do not fall back to app-level free in this case.
    return null;
  }

  return env.APP_FREE_PLAN_ENABLED ? "free" : null;
}
