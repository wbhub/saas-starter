import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeServerClient } from "@/lib/stripe/server";
import { logger } from "@/lib/logger";

/**
 * Ensures a Stripe customer exists for the given team, creating one if needed.
 * Intended to be called early (e.g. page load) so the customer is ready by
 * the time the user initiates checkout.
 *
 * Returns the Stripe customer ID, or null if Stripe is not configured.
 */
export async function ensureStripeCustomerForTeam(
  teamId: string,
  userId: string,
  userEmail: string,
): Promise<string | null> {
  const stripe = getStripeServerClient();
  if (!stripe) return null;

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("team_id", teamId)
    .maybeSingle<{ stripe_customer_id: string }>();

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  try {
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: {
        supabase_team_id: teamId,
        supabase_user_id: userId,
      },
    });

    // Upsert mapping (handles races with concurrent requests)
    await admin
      .from("stripe_customers")
      .upsert({ team_id: teamId, stripe_customer_id: customer.id }, { onConflict: "team_id" });

    // Re-read to get the winner if a race occurred
    const { data: mapping } = await admin
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("team_id", teamId)
      .maybeSingle<{ stripe_customer_id: string }>();

    const mappedId = mapping?.stripe_customer_id ?? customer.id;

    if (mappedId !== customer.id) {
      await stripe.customers.del(customer.id).catch((err) => {
        logger.warn("Failed to cleanup duplicate Stripe customer after race", {
          teamId,
          duplicateCustomerId: customer.id,
          error: err,
        });
      });
    }

    return mappedId;
  } catch (error) {
    logger.warn("Failed to eagerly create Stripe customer", { teamId, error });
    return null;
  }
}
