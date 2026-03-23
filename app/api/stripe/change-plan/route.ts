import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { getPlanByKey } from "@/lib/stripe/config";
import { getStripeServerClient } from "@/lib/stripe/server";
import { syncSubscription } from "@/lib/stripe/sync";
import { isBillingEnabled } from "@/lib/billing/capabilities";
import { requireJsonContentType } from "@/lib/http/content-type";
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
  const t = await getRouteTranslator("ApiStripeChangePlan", req);

  if (!isBillingEnabled()) {
    return NextResponse.json(
      { error: t("errors.billingNotConfigured") },
      { status: 503 },
    );
  }

  const stripe = getStripeServerClient();
  if (!stripe) {
    return NextResponse.json(
      { error: t("errors.billingNotConfigured") },
      { status: 503 },
    );
  }

  const csrfError = verifyCsrfProtection(req, {
    invalidOrigin: t("errors.invalidOrigin"),
    missingToken: t("errors.missingCsrfToken"),
    invalidToken: t("errors.invalidCsrfToken"),
  });
  if (csrfError) {
    return csrfError;
  }

  const contentTypeError = requireJsonContentType(req, {
    errorMessage: t("errors.invalidContentType"),
  });
  if (contentTypeError) {
    return contentTypeError;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: t("errors.unauthorized") }, { status: 401 });
  }

  const teamContext = await getCachedTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return NextResponse.json(
      { error: t("errors.noTeamMembership") },
      { status: 403 },
    );
  }
  if (!canManageTeamBilling(teamContext.role)) {
    return NextResponse.json(
      { error: t("errors.forbidden") },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: `stripe-change-plan:team:${teamContext.teamId}`,
    ...RATE_LIMITS.stripeChangePlanByTeam,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: t("errors.rateLimited") },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const bodyParse = await parseJsonWithSchema(req, changePlanPayloadSchema);
  if (!bodyParse.success && bodyParse.tooLarge) {
    return NextResponse.json({ error: t("errors.payloadTooLarge") }, { status: 413 });
  }
  const planKey = bodyParse.success ? parsePlanKey(bodyParse.data) : null;
  if (!planKey) {
    return NextResponse.json({ error: t("errors.invalidPayload") }, { status: 400 });
  }

  const plan = getPlanByKey(planKey);
  if (!plan) {
    return NextResponse.json({ error: t("errors.invalidTargetPlan") }, { status: 400 });
  }
  if (!plan.priceId) {
    return NextResponse.json(
      { error: t("errors.billingPlansNotConfigured") },
      { status: 503 },
    );
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
    return NextResponse.json(
      { error: t("errors.couldNotLoadSubscription") },
      { status: 500 },
    );
  }

  if (!subscriptionRow?.stripe_subscription_id) {
    return NextResponse.json(
      { error: t("errors.noActiveSubscription") },
      { status: 404 },
    );
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
      return NextResponse.json(
        {
          error: t("errors.billingIdentityMismatch"),
        },
        { status: 409 },
      );
    }

    const firstItem = stripeSubscription.items.data[0];

    if (!firstItem) {
      return NextResponse.json(
        { error: t("errors.subscriptionItemNotFound") },
        { status: 400 },
      );
    }

    if (firstItem.price.id === plan.priceId) {
      return NextResponse.json(
        { error: t("errors.alreadyOnPlan") },
        { status: 409 },
      );
    }

    const updated = await stripe.subscriptions.update(
      stripeSubscription.id,
      {
        items: [{ id: firstItem.id, price: plan.priceId, quantity: firstItem.quantity ?? 1 }],
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
        plan.priceId,
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
      return NextResponse.json({ ok: true });
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
      return NextResponse.json(
        {
          ok: true,
          warning: t("errors.postChangeSyncFailed"),
          planChanged: true,
        },
        { status: 200 },
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
    return NextResponse.json(
      { error: t("errors.unableToChangePlan") },
      { status: 500 },
    );
  }
}
