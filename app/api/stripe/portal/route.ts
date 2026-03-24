import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { getOrCreateRequestId, withRequestId } from "@/lib/http/request-id";
import { createClient } from "@/lib/supabase/server";
import { getStripeServerClient } from "@/lib/stripe/server";
import { getAppUrl } from "@/lib/env";
import { isBillingEnabled } from "@/lib/billing/capabilities";
import { requireJsonContentType } from "@/lib/http/content-type";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { logger } from "@/lib/logger";
import { canManageTeamBilling } from "@/lib/team-context";
import { getCachedTeamContextForUser } from "@/lib/team-context-cache";

type StripeCustomerRow = {
  stripe_customer_id: string | null;
};

async function isOwnedStripeCustomer(teamId: string, customerId: string) {
  const stripe = getStripeServerClient();
  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }
  const customer = await stripe.customers.retrieve(customerId);
  if ("deleted" in customer) {
    return false;
  }

  return customer.metadata?.supabase_team_id === teamId;
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const err = (error: string, status: number, init?: ResponseInit) =>
    withRequestId(jsonError(error, status, init), requestId);

  const t = await getRouteTranslator("ApiStripePortal", request);

  if (!isBillingEnabled()) {
    return err(t("errors.billingNotConfigured"), 503);
  }

  const stripe = getStripeServerClient();
  if (!stripe) {
    return err(t("errors.billingNotConfigured"), 503);
  }

  const csrfError = verifyCsrfProtection(request, {
    invalidOrigin: t("errors.invalidOrigin"),
    missingToken: t("errors.missingCsrfToken"),
    invalidToken: t("errors.invalidCsrfToken"),
  });
  if (csrfError) {
    return withRequestId(csrfError, requestId);
  }

  const contentTypeError = requireJsonContentType(request, {
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
    key: `stripe-portal:team:${teamContext.teamId}`,
    ...RATE_LIMITS.stripePortalByTeam,
  });
  if (!rateLimit.allowed) {
    return err(t("errors.rateLimited"), 429, {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const { data: customerRow, error: customerRowError } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("team_id", teamContext.teamId)
    .maybeSingle<StripeCustomerRow>();

  if (customerRowError) {
    return err(t("errors.couldNotLoadStripeCustomer"), 500);
  }

  if (!customerRow?.stripe_customer_id) {
    return err(t("errors.noCustomerRecord"), 404);
  }

  try {
    const isOwned = await isOwnedStripeCustomer(teamContext.teamId, customerRow.stripe_customer_id);
    if (!isOwned) {
      return err(t("errors.billingIdentityMismatch"), 409);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerRow.stripe_customer_id,
      return_url: `${getAppUrl()}/dashboard`,
    });

    return withRequestId(jsonSuccess({ url: session.url }), requestId);
  } catch (error) {
    logger.error("Failed to create Stripe billing portal session", error);
    return err(t("errors.unableToOpenPortal"), 500);
  }
}
