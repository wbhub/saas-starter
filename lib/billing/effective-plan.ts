import { env } from "@/lib/env";
import { LIVE_SUBSCRIPTION_STATUSES, type PlanKey, type SubscriptionStatus } from "@/lib/stripe/plans";

export type EffectivePlanKey = "free" | PlanKey;

type SubscriptionPlanInput = {
  status?: SubscriptionStatus | null;
  stripe_price_id?: string | null;
};

function isLiveSubscriptionStatus(status: SubscriptionStatus | null | undefined): status is SubscriptionStatus {
  if (!status) {
    return false;
  }
  return LIVE_SUBSCRIPTION_STATUSES.includes(status);
}

function resolvePaidPlanKeyByPriceId(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) {
    return null;
  }

  if (process.env.STRIPE_STARTER_PRICE_ID?.trim() === priceId) {
    return "starter";
  }
  if (process.env.STRIPE_GROWTH_PRICE_ID?.trim() === priceId) {
    return "growth";
  }
  if (process.env.STRIPE_PRO_PRICE_ID?.trim() === priceId) {
    return "pro";
  }

  return null;
}

export function resolveEffectivePlanKey(
  subscription: SubscriptionPlanInput | null | undefined,
): EffectivePlanKey | null {
  if (isLiveSubscriptionStatus(subscription?.status)) {
    const paidPlanKey = resolvePaidPlanKeyByPriceId(subscription?.stripe_price_id);
    if (paidPlanKey) {
      return paidPlanKey;
    }

    // Live paid subscription exists but price ID is unknown to app config.
    // Do not fall back to app-level free in this case.
    return null;
  }

  return env.APP_FREE_PLAN_ENABLED ? "free" : null;
}
