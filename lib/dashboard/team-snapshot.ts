import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAiAccess } from "@/lib/ai/access";
import {
  getAiAccessMode,
  getAiAllowedSubscriptionStatuses,
  type AiAccessMode,
} from "@/lib/ai/config";
import { isAiProviderConfigured } from "@/lib/ai/provider";
import { isBillingEnabled } from "@/lib/billing/capabilities";
import { hasFeatureAccess } from "@/lib/billing/entitlements";
import { resolveEffectivePlanKey, type EffectivePlanKey } from "@/lib/billing/effective-plan";
import { logger } from "@/lib/logger";
import {
  LIVE_SUBSCRIPTION_STATUSES,
  type PlanInterval,
  type SubscriptionStatus,
} from "@/lib/stripe/plans";
import { resolvePlanWithIntervalByPriceId } from "@/lib/stripe/price-id-lookup";
import { measureDashboardTask } from "@/lib/dashboard/perf";

export type SubscriptionRow = {
  status: SubscriptionStatus;
  stripe_price_id: string;
  seat_quantity: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type DashboardBillingContext = {
  billingEnabled: boolean;
  subscription: SubscriptionRow | null;
  effectivePlanKey: EffectivePlanKey | null;
  billingInterval: PlanInterval | null;
  memberCount: number;
  isPaidPlan: boolean;
  canInviteMembers: boolean;
};

export type DashboardAiUiGateReason =
  | "enabled"
  | "ai_not_configured"
  | "plan_not_allowed"
  | "access_mode_invalid"
  | "team_context_missing";

export type DashboardAiUiGate = {
  isVisibleInUi: boolean;
  reason: DashboardAiUiGateReason;
  effectivePlanKey: EffectivePlanKey | null;
  accessMode: AiAccessMode;
};

export type DashboardTeamUiMode = "free" | "paid_solo" | "paid_team";

export type DashboardTeamSnapshot = {
  billingContext: DashboardBillingContext;
  aiUiGate: DashboardAiUiGate;
  teamUiMode: DashboardTeamUiMode;
};

export async function getLiveSubscription(
  supabase: SupabaseClient,
  teamId: string,
): Promise<SubscriptionRow | null> {
  try {
    const subscriptionFetchResult = await supabase
      .from("subscriptions")
      .select("status,stripe_price_id,seat_quantity,current_period_end,cancel_at_period_end")
      .eq("team_id", teamId)
      .in("status", LIVE_SUBSCRIPTION_STATUSES)
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle<SubscriptionRow>();
    if (subscriptionFetchResult.error) {
      logger.warn(
        "Failed to load dashboard subscription; continuing without active subscription.",
        {
          error: subscriptionFetchResult.error,
        },
      );
      return null;
    }
    return subscriptionFetchResult.data;
  } catch (error) {
    logger.warn("Failed to load dashboard subscription; continuing without active subscription.", {
      error,
    });
    return null;
  }
}

export async function getTeamMemberCount(supabase: SupabaseClient, teamId: string) {
  try {
    const memberCountResult = await supabase
      .from("team_memberships")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId);
    if (memberCountResult.error) {
      logger.warn("Failed to load team member count; defaulting to one member.", {
        teamId,
        error: memberCountResult.error,
      });
      return 1;
    }
    return Math.max(1, memberCountResult.count ?? 1);
  } catch (error) {
    logger.warn("Failed to load team member count; defaulting to one member.", {
      teamId,
      error,
    });
    return 1;
  }
}

export async function getDashboardBillingContext(
  supabase: SupabaseClient,
  teamId: string,
): Promise<DashboardBillingContext> {
  const billingEnabled = isBillingEnabled();
  const [subscription, memberCount] = await Promise.all([
    getLiveSubscription(supabase, teamId),
    getTeamMemberCount(supabase, teamId),
  ]);

  const effectivePlanKey = resolveEffectivePlanKey(subscription);
  const billingInterval =
    resolvePlanWithIntervalByPriceId(subscription?.stripe_price_id)?.interval ?? null;
  const canInviteMembers = hasFeatureAccess(effectivePlanKey, "canInviteMembers");
  const isPaidPlan = Boolean(effectivePlanKey && effectivePlanKey !== "free");

  return {
    billingEnabled,
    subscription,
    effectivePlanKey,
    billingInterval,
    memberCount,
    isPaidPlan,
    canInviteMembers,
  };
}

export function getDashboardTeamUiMode(
  billingContext: Pick<DashboardBillingContext, "isPaidPlan" | "memberCount">,
): DashboardTeamUiMode {
  if (!billingContext.isPaidPlan) {
    return "free";
  }

  return billingContext.memberCount > 1 ? "paid_team" : "paid_solo";
}

export async function getDashboardAiUiGate(
  supabase: SupabaseClient,
  teamId: string | null,
  options?: {
    billingContext?: Pick<DashboardBillingContext, "effectivePlanKey" | "subscription">;
  },
): Promise<DashboardAiUiGate> {
  const accessMode = getAiAccessMode();
  if (!teamId) {
    return {
      isVisibleInUi: false,
      reason: "team_context_missing",
      effectivePlanKey: null,
      accessMode,
    };
  }

  if (!isAiProviderConfigured) {
    return {
      isVisibleInUi: false,
      reason: "ai_not_configured",
      effectivePlanKey: null,
      accessMode,
    };
  }

  try {
    const billingContext = options?.billingContext;
    let effectivePlanKey: EffectivePlanKey | null =
      billingContext?.effectivePlanKey ?? resolveEffectivePlanKey(null);
    if (accessMode === "paid") {
      const allowedStatuses = getAiAllowedSubscriptionStatuses();
      if (!allowedStatuses.length) {
        return {
          isVisibleInUi: false,
          reason: "access_mode_invalid",
          effectivePlanKey: null,
          accessMode,
        };
      }

      const subscriptionStatus = billingContext?.subscription?.status ?? null;
      if (subscriptionStatus && allowedStatuses.includes(subscriptionStatus)) {
        effectivePlanKey = billingContext?.effectivePlanKey ?? effectivePlanKey;
      } else if (billingContext) {
        effectivePlanKey = resolveEffectivePlanKey(null);
      }
    }

    if (accessMode !== "all" && !billingContext) {
      let subscriptionQuery = supabase
        .from("subscriptions")
        .select("stripe_price_id,status")
        .eq("team_id", teamId)
        .in("status", LIVE_SUBSCRIPTION_STATUSES);

      if (accessMode === "paid") {
        subscriptionQuery = subscriptionQuery.in("status", getAiAllowedSubscriptionStatuses());
      }

      const subscriptionResult = await subscriptionQuery
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle<{ stripe_price_id: string | null; status: SubscriptionStatus | null }>();

      if (subscriptionResult.error) {
        logger.warn(
          "Failed to resolve AI UI gate subscription context; defaulting to hidden AI UI.",
          {
            teamId,
            accessMode,
            error: subscriptionResult.error,
          },
        );
        return {
          isVisibleInUi: false,
          reason: "access_mode_invalid",
          effectivePlanKey: null,
          accessMode,
        };
      }

      effectivePlanKey = resolveEffectivePlanKey(subscriptionResult.data);
    }

    const aiAccess = resolveAiAccess({ effectivePlanKey });
    if (!aiAccess.allowed || !aiAccess.model) {
      return {
        isVisibleInUi: false,
        reason:
          aiAccess.denialReason === "default_model_missing" ||
          aiAccess.denialReason === "plan_model_missing"
            ? "access_mode_invalid"
            : "plan_not_allowed",
        effectivePlanKey,
        accessMode,
      };
    }

    return {
      isVisibleInUi: true,
      reason: "enabled",
      effectivePlanKey,
      accessMode,
    };
  } catch (error) {
    logger.warn("Failed to resolve AI UI gate; defaulting to hidden AI UI.", {
      teamId,
      accessMode,
      error,
    });
    return {
      isVisibleInUi: false,
      reason: "access_mode_invalid",
      effectivePlanKey: null,
      accessMode,
    };
  }
}

export async function resolveDashboardTeamSnapshot(
  supabase: SupabaseClient,
  teamId: string,
): Promise<DashboardTeamSnapshot> {
  return measureDashboardTask("dashboard.teamSnapshot", { teamId }, async () => {
    const billingContext = await getDashboardBillingContext(supabase, teamId);
    const aiUiGate = await getDashboardAiUiGate(supabase, teamId, {
      billingContext,
    });

    return {
      billingContext,
      aiUiGate,
      teamUiMode: getDashboardTeamUiMode(billingContext),
    };
  });
}
