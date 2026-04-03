import { createClient } from "@/lib/supabase/server";
import { getPlanByKey, getPlanPriceId } from "@/lib/stripe/config";
import { getStripeServerClient } from "@/lib/stripe/server";
import { isBillingEnabled } from "@/lib/billing/capabilities";
import { requireJsonContentType } from "@/lib/http/content-type";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { getOrCreateRequestId, withRequestId } from "@/lib/http/request-id";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { LIVE_SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "@/lib/stripe/plans";
import { resolvePlanWithIntervalByPriceId } from "@/lib/stripe/price-id-lookup";
import { parsePlanKey } from "@/lib/validation";
import { canManageTeamBilling } from "@/lib/team-context";
import { getCachedTeamContextForUser } from "@/lib/team-context-cache";

const previewPayloadSchema = z.object({
  planKey: z.string().trim(),
});

type ExistingSubscriptionRow = {
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
  stripe_subscription_item_id?: string | null;
  seat_quantity: number;
  status: SubscriptionStatus;
};

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
    key: `stripe-preview-proration:team:${teamContext.teamId}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return err(t("errors.rateLimited"), 429, {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const bodyParse = await parseJsonWithSchema(req, previewPayloadSchema);
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

  // Try to select the stripe_subscription_item_id column (added in a later
  // schema migration). If the column doesn't exist yet, fall back to a query
  // without it — the Stripe retrieve path handles the missing item ID.
  let subscriptionRow: ExistingSubscriptionRow | null = null;
  let subscriptionRowError: { message: string } | null = null;

  const fullQuery = await supabase
    .from("subscriptions")
    .select(
      "stripe_subscription_id,stripe_customer_id,stripe_price_id,stripe_subscription_item_id,seat_quantity,status",
    )
    .eq("team_id", teamContext.teamId)
    .in("status", LIVE_SUBSCRIPTION_STATUSES)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle<ExistingSubscriptionRow>();

  if (fullQuery.error) {
    // Column may not exist — retry without it.
    const fallbackQuery = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id,stripe_customer_id,stripe_price_id,seat_quantity,status")
      .eq("team_id", teamContext.teamId)
      .in("status", LIVE_SUBSCRIPTION_STATUSES)
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle<ExistingSubscriptionRow>();

    subscriptionRow = fallbackQuery.data;
    subscriptionRowError = fallbackQuery.error;
  } else {
    subscriptionRow = fullQuery.data;
  }

  if (subscriptionRowError) {
    return err(t("errors.couldNotLoadSubscription"), 500);
  }

  if (!subscriptionRow?.stripe_subscription_id) {
    return err(t("errors.noActiveSubscription"), 404);
  }

  // Derive the billing interval from the locally cached price ID so we can
  // skip a stripe.subscriptions.retrieve() round-trip.
  const currentPlanWithInterval = resolvePlanWithIntervalByPriceId(subscriptionRow.stripe_price_id);
  const currentInterval = currentPlanWithInterval?.interval ?? "month";

  const targetPriceId = getPlanPriceId(plan.key, currentInterval);
  if (!targetPriceId) {
    return err(t("errors.billingPlansNotConfigured"), 503);
  }

  if (subscriptionRow.stripe_price_id === targetPriceId) {
    return err(t("errors.alreadyOnPlan"), 409);
  }

  // If the subscription item ID is cached locally, go straight to the preview
  // (single Stripe call). Otherwise fall back to a retrieve first.
  try {
    let itemId = subscriptionRow.stripe_subscription_item_id;
    let customerId = subscriptionRow.stripe_customer_id;
    const quantity = subscriptionRow.seat_quantity ?? 1;

    if (!itemId || !customerId) {
      const stripeSubscription = await stripe.subscriptions.retrieve(
        subscriptionRow.stripe_subscription_id,
      );
      const firstItem = stripeSubscription.items.data[0];
      if (!firstItem) {
        return err(t("errors.subscriptionItemNotFound"), 400);
      }
      itemId = firstItem.id;
      customerId =
        typeof stripeSubscription.customer === "string"
          ? stripeSubscription.customer
          : stripeSubscription.customer.id;
    }

    const preview = await stripe.invoices.createPreview({
      customer: customerId,
      subscription: subscriptionRow.stripe_subscription_id,
      subscription_details: {
        items: [{ id: itemId, price: targetPriceId, quantity }],
        proration_behavior: "create_prorations",
      },
    });

    const amountDue = preview.amount_due / 100;
    const currency = preview.currency.toUpperCase();
    const isCredit = amountDue < 0;

    return withRequestId(
      jsonSuccess({
        amountDue,
        currency,
        isCredit,
        targetPlanName: plan.name,
      }),
      requestId,
    );
  } catch {
    return err(t("errors.unableToChangePlan"), 500);
  }
}
