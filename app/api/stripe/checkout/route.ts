import { CHECKOUT_IN_FLIGHT_WINDOW_MS } from "@/lib/constants/billing";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { getOrCreateRequestId, withRequestId } from "@/lib/http/request-id";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { createClient } from "@/lib/supabase/server";
import { getPlanByKey, getPlanPriceId } from "@/lib/stripe/config";
import { getStripeServerClient } from "@/lib/stripe/server";
import { getOrCreateStripeCustomerForTeam } from "@/lib/stripe/customer";
import { getAppUrl } from "@/lib/env";
import { isBillingEnabled } from "@/lib/billing/capabilities";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";
import { parsePlanKey } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { canManageTeamBilling } from "@/lib/team-context";
import { getCachedTeamContextForUser } from "@/lib/team-context-cache";
const checkoutPayloadSchema = z.object({
  planKey: z.string().trim(),
  interval: z.enum(["month", "year"]).optional().default("month"),
  source: z.string().trim().optional(),
});

type ExistingSubscriptionRow = {
  stripe_subscription_id: string | null;
};

function getCheckoutIdempotencyKey(
  request: Request,
  teamId: string,
  planKey: string,
  interval: "month" | "year",
) {
  const rawKey = request.headers.get("x-idempotency-key")?.trim();
  if (!rawKey) {
    return undefined;
  }

  const safeKey = rawKey.slice(0, 80);
  return `checkout:${teamId}:${planKey}:${interval}:${safeKey}`;
}

function getScopedIdempotencyKey(baseKey: string | undefined, scope: string) {
  if (!baseKey) {
    return undefined;
  }

  return `${baseKey}:${scope}`;
}

function getCheckoutCustomerIdempotencyKey(teamId: string) {
  return `checkout-customer:${teamId}`;
}

export async function POST(req: Request) {
  const t = await getRouteTranslator("ApiStripeCheckout", req);
  const requestId = getOrCreateRequestId(req);
  const err = (error: string, status: number, init?: ResponseInit) =>
    withRequestId(jsonError(error, status, init), requestId);

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
    key: `stripe-checkout:team:${teamContext.teamId}`,
    ...RATE_LIMITS.stripeCheckoutByTeam,
  });
  if (!rateLimit.allowed) {
    return err(t("errors.rateLimited"), 429, {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const bodyParse = await parseJsonWithSchema(req, checkoutPayloadSchema);
  if (!bodyParse.success && bodyParse.tooLarge) {
    return err(t("errors.payloadTooLarge"), 413);
  }
  const planKey = bodyParse.success ? parsePlanKey(bodyParse.data) : null;
  if (!planKey) {
    return err(t("errors.invalidPayload"), 400);
  }
  const requestedInterval = bodyParse.success ? bodyParse.data.interval : "month";
  const checkoutSource = bodyParse.success ? bodyParse.data.source : undefined;

  const plan = getPlanByKey(planKey);
  if (!plan) {
    return err(t("errors.invalidPlan"), 400);
  }
  const resolvedPriceId = getPlanPriceId(plan.key, requestedInterval);
  if (!resolvedPriceId) {
    return err(t("errors.billingPlansNotConfigured"), 503);
  }
  const idempotencyKey = getCheckoutIdempotencyKey(
    req,
    teamContext.teamId,
    plan.key,
    requestedInterval,
  );

  const inFlightCheckout = await checkRateLimit({
    key: `stripe-checkout:inflight:${teamContext.teamId}:${plan.key}`,
    limit: 1,
    windowMs: CHECKOUT_IN_FLIGHT_WINDOW_MS,
  });
  if (!inFlightCheckout.allowed) {
    return err(t("errors.checkoutInProgress"), 409, {
      headers: { "Retry-After": String(inFlightCheckout.retryAfterSeconds) },
    });
  }

  // Check our DB for an existing live subscription (fast, local query).
  const { data: existingSubscription, error: existingSubscriptionError } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("team_id", teamContext.teamId)
    .in("status", LIVE_SUBSCRIPTION_STATUSES)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle<ExistingSubscriptionRow>();

  if (existingSubscriptionError) {
    return err(t("errors.couldNotVerifySubscription"), 500);
  }

  if (existingSubscription?.stripe_subscription_id) {
    return err(t("errors.activeSubscriptionExists"), 409);
  }

  try {
    const customerId = await getOrCreateStripeCustomerForTeam({
      stripe,
      teamId: teamContext.teamId,
      userId: user.id,
      email: user.email,
      // Keep customer creation idempotent per team so concurrent checkout attempts
      // cannot create duplicate Stripe customers before the DB mapping is written.
      idempotencyKey: getCheckoutCustomerIdempotencyKey(teamContext.teamId),
    });
    const appUrl = getAppUrl();

    const isOnboardingSource = checkoutSource === "onboarding";
    const successPath = isOnboardingSource
      ? "/onboarding?checkout=success&session_id={CHECKOUT_SESSION_ID}"
      : "/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}";
    const cancelPath = isOnboardingSource ? "/onboarding" : "/dashboard/billing?checkout=canceled";

    const sessionIdempotencyKey = getScopedIdempotencyKey(idempotencyKey, "session");
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        client_reference_id: teamContext.teamId,
        line_items: [{ price: resolvedPriceId, quantity: 1 }],
        success_url: `${appUrl}${successPath}`,
        cancel_url: `${appUrl}${cancelPath}`,
        metadata: {
          supabase_team_id: teamContext.teamId,
          supabase_user_id: user.id,
        },
      },
      sessionIdempotencyKey ? { idempotencyKey: sessionIdempotencyKey } : undefined,
    );

    return withRequestId(jsonSuccess({ url: session.url }), requestId);
  } catch (error) {
    logger.error("Failed to create Stripe checkout session", error);
    return err(t("errors.unableToStartCheckout"), 500);
  }
}
