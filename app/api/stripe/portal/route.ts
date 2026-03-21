import { NextResponse } from "next/server";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { getStripeServerClient } from "@/lib/stripe/server";
import { getAppUrl } from "@/lib/env";
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
  const t = await getRouteTranslator("ApiStripePortal", request);

  const stripe = getStripeServerClient();
  if (!stripe) {
    return NextResponse.json(
      { error: t("errors.billingNotConfigured") },
      { status: 503 },
    );
  }

  const csrfError = verifyCsrfProtection(request, {
    invalidOrigin: t("errors.invalidOrigin"),
    missingToken: t("errors.missingCsrfToken"),
    invalidToken: t("errors.invalidCsrfToken"),
  });
  if (csrfError) {
    return csrfError;
  }

  const contentTypeError = requireJsonContentType(request, {
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
    key: `stripe-portal:team:${teamContext.teamId}`,
    ...RATE_LIMITS.stripePortalByTeam,
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

  const { data: customerRow, error: customerRowError } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("team_id", teamContext.teamId)
    .maybeSingle<StripeCustomerRow>();

  if (customerRowError) {
    return NextResponse.json(
      { error: t("errors.couldNotLoadStripeCustomer") },
      { status: 500 },
    );
  }

  if (!customerRow?.stripe_customer_id) {
    return NextResponse.json(
      { error: t("errors.noCustomerRecord") },
      { status: 404 },
    );
  }

  try {
    const isOwned = await isOwnedStripeCustomer(teamContext.teamId, customerRow.stripe_customer_id);
    if (!isOwned) {
      return NextResponse.json(
        {
          error: t("errors.billingIdentityMismatch"),
        },
        { status: 409 },
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerRow.stripe_customer_id,
      return_url: `${getAppUrl()}/dashboard`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logger.error("Failed to create Stripe billing portal session", error);
    return NextResponse.json(
      { error: t("errors.unableToOpenPortal") },
      { status: 500 },
    );
  }
}
