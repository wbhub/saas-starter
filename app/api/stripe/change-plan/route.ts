import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { getPlanByKey } from "@/lib/stripe/config";
import { stripe } from "@/lib/stripe/server";
import { syncSubscription } from "@/lib/stripe/sync";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";
import { enqueueSeatSyncRetry } from "@/lib/stripe/seat-sync-retries";
import { parsePlanKey } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { getTeamContextForUser } from "@/lib/team-context";
const changePlanPayloadSchema = z.object({
  planKey: z.string().trim(),
});

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
    .maybeSingle<{ stripe_price_id: string; status: string }>();

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
  const csrfError = verifyCsrfProtection(req);
  if (csrfError) {
    return csrfError;
  }

  const contentTypeError = requireJsonContentType(req);
  if (contentTypeError) {
    return contentTypeError;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamContext = await getTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return NextResponse.json(
      { error: "No team membership found for this account." },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: `stripe-change-plan:team:${teamContext.teamId}`,
    ...RATE_LIMITS.stripeChangePlanByTeam,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const bodyParse = await parseJsonWithSchema(req, changePlanPayloadSchema);
  const planKey = bodyParse.success ? parsePlanKey(bodyParse.data) : null;
  if (!planKey) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const plan = getPlanByKey(planKey);
  if (!plan) {
    return NextResponse.json({ error: "Invalid target plan" }, { status: 400 });
  }
  const idempotencyKey = getChangePlanIdempotencyKey(req, teamContext.teamId, plan.key);

  const { data: subscriptionRow, error: subscriptionRowError } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id,status")
    .eq("team_id", teamContext.teamId)
    .in("status", LIVE_SUBSCRIPTION_STATUSES)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionRowError) {
    return NextResponse.json(
      { error: "Could not load current subscription state." },
      { status: 500 },
    );
  }

  if (!subscriptionRow?.stripe_subscription_id) {
    return NextResponse.json(
      { error: "No active subscription found. Start a new checkout first." },
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
          error:
            "Billing identity mismatch detected. Start a new checkout to re-link your account.",
        },
        { status: 409 },
      );
    }

    const firstItem = stripeSubscription.items.data[0];

    if (!firstItem) {
      return NextResponse.json(
        { error: "Subscription item not found." },
        { status: 400 },
      );
    }

    if (firstItem.price.id === plan.priceId) {
      return NextResponse.json(
        { error: "Your subscription is already on this plan." },
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
          error: "Plan changed, but local billing sync failed. Please retry shortly.",
          planChanged: true,
        },
        { status: 500 },
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
      { error: "Unable to change your plan right now. Please try again." },
      { status: 500 },
    );
  }
}
