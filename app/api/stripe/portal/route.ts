import { NextResponse } from "next/server";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";
import { env } from "@/lib/env";
import { requireJsonContentType } from "@/lib/http/content-type";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { logger } from "@/lib/logger";
import { canManageTeamBilling, getTeamContextForUser } from "@/lib/team-context";

async function isOwnedStripeCustomer(teamId: string, customerId: string) {
  const customer = await stripe.customers.retrieve(customerId);
  if ("deleted" in customer) {
    return false;
  }

  return customer.metadata?.supabase_team_id === teamId;
}

export async function POST(request: Request) {
  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const contentTypeError = requireJsonContentType(request);
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
  if (!canManageTeamBilling(teamContext.role)) {
    return NextResponse.json(
      { error: "Only team owners and admins can manage billing." },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: `stripe-portal:team:${teamContext.teamId}`,
    ...RATE_LIMITS.stripePortalByTeam,
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

  const { data: customerRow, error: customerRowError } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("team_id", teamContext.teamId)
    .maybeSingle();

  if (customerRowError) {
    return NextResponse.json(
      { error: "Could not load Stripe customer record." },
      { status: 500 },
    );
  }

  if (!customerRow?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No customer record found for this account." },
      { status: 404 },
    );
  }

  try {
    const isOwned = await isOwnedStripeCustomer(teamContext.teamId, customerRow.stripe_customer_id);
    if (!isOwned) {
      return NextResponse.json(
        {
          error:
            "Billing identity mismatch detected. Start a new checkout to re-link your account.",
        },
        { status: 409 },
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerRow.stripe_customer_id,
      return_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logger.error("Failed to create Stripe billing portal session", error);
    return NextResponse.json(
      { error: "Unable to open billing portal right now. Please try again." },
      { status: 500 },
    );
  }
}
