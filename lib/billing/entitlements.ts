import type { EffectivePlanKey } from "@/lib/billing/effective-plan";

export const BILLING_FEATURES = ["canInviteMembers"] as const;
export type BillingFeatureName = (typeof BILLING_FEATURES)[number];

type BillingEntitlements = Record<BillingFeatureName, boolean>;

const FREE_PLAN_ENTITLEMENTS: BillingEntitlements = {
  canInviteMembers: false,
};

const PAID_PLAN_ENTITLEMENTS: BillingEntitlements = {
  canInviteMembers: true,
};

const ENTITLEMENTS_BY_PLAN: Record<EffectivePlanKey, BillingEntitlements> = {
  free: FREE_PLAN_ENTITLEMENTS,
  starter: PAID_PLAN_ENTITLEMENTS,
  growth: PAID_PLAN_ENTITLEMENTS,
  pro: PAID_PLAN_ENTITLEMENTS,
};

export function hasFeatureAccess(
  effectivePlanKey: EffectivePlanKey | null | undefined,
  featureName: BillingFeatureName,
) {
  if (!effectivePlanKey) {
    return false;
  }

  return ENTITLEMENTS_BY_PLAN[effectivePlanKey][featureName];
}
