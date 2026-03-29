import "server-only";
import { getStripeServerClient } from "@/lib/stripe/server";
import { getPlanByKey, getPlanPriceId } from "@/lib/stripe/config";
import { getAppUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";
import { logger } from "@/lib/logger";
import type { PlanKey, PlanInterval } from "@/lib/stripe/plans";

type CreateCheckoutUrlParams = {
  teamId: string;
  userId: string;
  userEmail: string;
  planKey: PlanKey;
  interval?: PlanInterval;
  source?: string;
  /** Pre-verified Stripe customer ID. When provided, skips customer lookup,
   *  ownership verification, and subscription checks. */
  stripeCustomerId?: string;
};

/**
 * Creates a Stripe Checkout session and returns the URL.
 * Intended for server-side use (server components, server actions).
 * Returns `null` if checkout cannot be created.
 */
export async function createCheckoutUrl(params: CreateCheckoutUrlParams): Promise<string | null> {
  const {
    teamId,
    userId,
    userEmail,
    planKey,
    interval = "month",
    source,
    stripeCustomerId: preVerifiedCustomerId,
  } = params;

  const stripe = getStripeServerClient();
  if (!stripe) return null;

  const plan = getPlanByKey(planKey);
  if (!plan) return null;

  const priceId = getPlanPriceId(plan.key, interval);
  if (!priceId) return null;

  let customerId = preVerifiedCustomerId;

  try {
    // When no pre-verified customer ID is provided, resolve and verify from scratch.
    if (!customerId) {
      const admin = createAdminClient();

      const { data: customerRow } = await admin
        .from("stripe_customers")
        .select("stripe_customer_id")
        .eq("team_id", teamId)
        .maybeSingle<{ stripe_customer_id: string | null }>();

      customerId = customerRow?.stripe_customer_id ?? undefined;

      // Verify ownership if customer exists
      if (customerId) {
        const customer = await stripe.customers.retrieve(customerId);
        if ("deleted" in customer || customer.metadata?.supabase_team_id !== teamId) {
          customerId = undefined;
        }
      }

      // Create customer if needed
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: {
            supabase_team_id: teamId,
            supabase_user_id: userId,
          },
        });

        await admin
          .from("stripe_customers")
          .upsert(
            { team_id: teamId, stripe_customer_id: customer.id },
            { onConflict: "team_id" },
          );

        const { data: mapping } = await admin
          .from("stripe_customers")
          .select("stripe_customer_id")
          .eq("team_id", teamId)
          .maybeSingle<{ stripe_customer_id: string }>();

        customerId = mapping?.stripe_customer_id ?? customer.id;

        if (customerId !== customer.id) {
          await stripe.customers.del(customer.id).catch((err) => {
            logger.warn("Failed to cleanup duplicate Stripe customer after race", {
              teamId,
              duplicateCustomerId: customer.id,
              error: err,
            });
          });
        }
      }

      // Check for existing subscription (only needed when customer wasn't pre-verified)
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });
      if (subs.data.some((s) => LIVE_SUBSCRIPTION_STATUSES.includes(s.status))) {
        return null;
      }
    }

    const appUrl = getAppUrl();
    const isOnboarding = source === "onboarding";
    const successPath = isOnboarding
      ? "/onboarding?checkout=success&session_id={CHECKOUT_SESSION_ID}"
      : "/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}";
    const cancelPath = isOnboarding ? "/onboarding" : "/dashboard/billing?checkout=canceled";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
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
