import "server-only";
import { getStripeServerClient } from "@/lib/stripe/server";
import { getPlanByKey, getPlanPriceId } from "@/lib/stripe/config";
import { getAppUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import type { PlanKey, PlanInterval } from "@/lib/stripe/plans";

type CreateCheckoutUrlParams = {
  teamId: string;
  userId: string;
  userEmail: string;
  planKey: PlanKey;
  interval?: PlanInterval;
  source?: string;
};

/**
 * Creates a Stripe Checkout session and returns the URL.
 * Intended for server-side use (server components, server actions).
 * Returns `null` if checkout cannot be created.
 *
 * For first-time users (no Stripe customer yet), passes `customer_email`
 * and lets Stripe auto-create the Customer in subscription mode.
 * The webhook saves the customer ID to our DB afterward.
 *
 * For returning users, passes the stored `customer` ID from our DB.
 */
export async function createCheckoutUrl(params: CreateCheckoutUrlParams): Promise<string | null> {
  const { teamId, userId, userEmail, planKey, interval = "month", source } = params;

  const stripe = getStripeServerClient();
  if (!stripe) return null;

  const plan = getPlanByKey(planKey);
  if (!plan) return null;

  const priceId = getPlanPriceId(plan.key, interval);
  if (!priceId) return null;

  try {
    // Look up existing Stripe customer from our DB (one fast query).
    // No Stripe API calls needed — we trust our own DB mapping.
    const admin = createAdminClient();
    const { data: customerRow } = await admin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("team_id", teamId)
      .maybeSingle<{ stripe_customer_id: string | null }>();

    const customerId = customerRow?.stripe_customer_id ?? undefined;

    const appUrl = getAppUrl();
    const isOnboarding = source === "onboarding";
    const successPath = isOnboarding
      ? "/onboarding?checkout=success&session_id={CHECKOUT_SESSION_ID}"
      : "/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}";
    const cancelPath = isOnboarding ? "/onboarding" : "/dashboard/billing?checkout=canceled";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      // For returning users, pass customer ID. For new users, pass email
      // and let Stripe auto-create the Customer in subscription mode.
      ...(customerId ? { customer: customerId } : { customer_email: userEmail }),
      client_reference_id: teamId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}${successPath}`,
      cancel_url: `${appUrl}${cancelPath}`,
      metadata: {
        supabase_team_id: teamId,
        supabase_user_id: userId,
      },
    });

    return session.url;
  } catch (error) {
    logger.error("Failed to create checkout session (server-side)", {
      teamId,
      planKey,
      error,
    });
    return null;
  }
}
