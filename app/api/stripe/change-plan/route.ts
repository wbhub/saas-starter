import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { getPlanByKey, getPlanPriceId } from "@/lib/stripe/config";
import { getStripeServerClient } from "@/lib/stripe/server";
import { syncSubscription } from "@/lib/stripe/sync";
import { isBillingEnabled } from "@/lib/billing/capabilities";
import { requireJsonContentType } from "@/lib/http/content-type";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { getOrCreateRequestId, withRequestId } from "@/lib/http/request-id";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { LIVE_SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "@/lib/stripe/plans";
import { enqueueSeatSyncRetry } from "@/lib/stripe/seat-sync-retries";
import { parsePlanKey } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { canManageTeamBilling } from "@/lib/team-context";
import { getCachedTeamContextForUser } from "@/lib/team-context-cache";
const changePlanPayloadSchema = z.object({
  planKey: z.string().trim(),
});

type ExistingSubscriptionRow = {
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
};

function getChangePlanIdempotencyKey(request: Request, teamId: string, planKey: string) {
  const rawKey = request.headers.get("x-idempotency-key")?.trim();
  if (!rawKey) {
    return undefined;
  }

  const safeKey = rawKey.slice(0, 80);
  return `change-plan:${teamId}:${planKey}:${safeKey}`;
}

async function isLocalSubscriptionSynced(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  stripeSubscriptionId: string,
  stripePriceId: string,
) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("stripe_price_id,status")
    .eq("team_id", teamId)
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .limit(1)
    .maybeSingle<{ stripe_price_id: string; status: SubscriptionStatus }>();

  if (error) {
    throw new Error(`Failed to verify local subscription sync: ${error.message}`);
  }

  return (
    !!data &&
    data.stripe_price_id === stripePriceId &&
    LIVE_SUBSCRIPTION_STATUSES.includes(data.status)
  );
}

export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req);
  const err = (error: string, status: number, init?: ResponseInit) =>
    withRequestId(jsonError(error, status, init), requestId);
  const t = await getRouteTranslator("ApiStripeChangePlan", req);

  if (!isBillingEnabled()) {
    return err(t("errors.billingNotConfigured"), 503);
  }

  const stripe = getStripeServerClient();
  if (!stripe) {
    return err(t("errors.billingNotConfigured"), 503);
  }

  const csrfError = verifyCsrfProtection(req, {
    invalidOrigin: t("errors.invalidOrigin"),
    missingToken: t("errors.missingCsrfToken"),
    invalidToken: t("errors.invalidCsrfToken"),
  });
  if (csrfError) {
    return withRequestId(csrfError, requestId);
  }

  const contentTypeError = requireJsonContentType(req, {
    errorMessage: t("errors.invalidContentType"),
  });
  if (contentTypeError) {
    return withRequestId(contentTypeError, requestId);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err(t("errors.unauthorized"), 401);
  }

  const teamContext = await getCachedTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return err(t("errors.noTeamMembership"), 403);
  }
  if (!canManageTeamBilling(teamContext.role)) {
    return err(t("errors.forbidden"), 403);
  }

  const rateLimit = await checkRateLimit({
    key: `stripe-change-plan:team:${teamContext.teamId}`,
    ...RATE_LIMITS.stripeChangePlanByTeam,
  });
  if (!rateLimit.allowed) {
    return err(t("errors.rateLimited"), 429, {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const bodyParse = await parseJsonWithSchema(req, changePlanPayloadSchema);
  if (!bodyParse.success && bodyParse.tooLarge) {
    return err(t("errors.payloadTooLarge"), 413);
  }
  const planKey = bodyParse.success ? parsePlanKey(bodyParse.data) : null;
  if (!planKey) {
    return err(t("errors.invalidPayload"), 400);
  }

  const plan = getPlanByKey(planKey);
  if (!plan) {
    return err(t("errors.invalidTargetPlan"), 400);
  }
  const idempotencyKey = getChangePlanIdempotencyKey(req, teamContext.teamId, plan.key);

  const { data: subscriptionRow, error: subscriptionRowError } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id,status")
    .eq("team_id", teamContext.teamId)
    .in("status", LIVE_SUBSCRIPTION_STATUSES)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle<ExistingSubscriptionRow>();

  if (subscriptionRowError) {
    return err(t("errors.couldNotLoadSubscription"), 500);
  }

  if (!subscriptionRow?.stripe_subscription_id) {
    return err(t("errors.noActiveSubscription"), 404);
  }

  try {
    // Single retrieve — used for both ownership verification and plan comparison.
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscriptionRow.stripe_subscription_id,
    );

    const customerId =
      typeof stripeSubscription.customer === "string"
        ? stripeSubscription.customer
        : stripeSubscription.customer.id;
    const customer = await stripe.customers.retrieve(customerId);

    if ("deleted" in customer || customer.metadata?.supabase_team_id !== teamContext.teamId) {
      return err(t("errors.billingIdentityMismatch"), 409);
    }

    const firstItem = stripeSubscription.items.data[0];

    if (!firstItem) {
      return err(t("errors.subscriptionItemNotFound"), 400);
    }

    const currentInterval = firstItem.price.recurring?.interval === "year" ? "year" : "month";
    const targetPriceId = getPlanPriceId(plan.key, currentInterval);
    if (!targetPriceId) {
      return err(t("errors.billingPlansNotConfigured"), 503);
    }

    if (firstItem.price.id === targetPriceId) {
      return err(t("errors.alreadyOnPlan"), 409);
    }

    const updated = await stripe.subscriptions.update(
      stripeSubscription.id,
      {
        items: [{ id: firstItem.id, price: targetPriceId, quantity: firstItem.quantity ?? 1 }],
        proration_behavior: "create_prorations",
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    try {
      await syncSubscription(updated, {
        eventCreatedUnix: Math.floor(Date.now() / 1000),
      });
      const localSyncComplete = await isLocalSubscriptionSynced(
        supabase,
        teamContext.teamId,
        stripeSubscription.id,
        targetPriceId,
      );
      if (!localSyncComplete) {
        throw new Error("Subscription sync completed, but local state does not match target plan.");
      }
      logAuditEvent({
        action: "billing.plan.change",
        outcome: "success",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        metadata: { targetPlanKey: plan.key, stripeSubscriptionId: stripeSubscription.id },
      });
      return withRequestId(jsonSuccess(), requestId);
    } catch (syncError) {
      logger.error("Plan changed in Stripe but local sync failed", syncError);
      try {
        await enqueueSeatSyncRetry({
          teamId: teamContext.teamId,
          source: "billing.plan.change",
          error: syncError,
        });
      } catch (retryError) {
        logger.error("Failed to enqueue retry after plan-change sync failure", retryError, {
          teamId: teamContext.teamId,
          stripeSubscriptionId: stripeSubscription.id,
        });
      }
      logAuditEvent({
        action: "billing.plan.change",
        outcome: "failure",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        metadata: {
          targetPlanKey: plan.key,
          stripeSubscriptionId: stripeSubscription.id,
          reason: "post_change_sync_failed",
        },
      });
      return withRequestId(
        jsonSuccess({ warning: t("errors.postChangeSyncFailed"), planChanged: true }),
        requestId,
      );
    }
  } catch (error) {
    logger.error("Failed to change Stripe subscription plan", error);
    logAuditEvent({
      action: "billing.plan.change",
      outcome: "failure",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: { targetPlanKey: plan.key },
    });
    return err(t("errors.unableToChangePlan"), 500);
  }
}
