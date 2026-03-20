import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { ALL_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";
import { logger } from "@/lib/logger";

function getAdminClient() {
  return createAdminClient();
}

function toIsoOrNull(value?: number | null) {
  if (value == null) return null;
  return new Date(value * 1000).toISOString();
}

function getEventCreatedIso(eventCreatedUnix?: number) {
  const unixSeconds = eventCreatedUnix ?? Math.floor(Date.now() / 1000);
  return new Date(unixSeconds * 1000).toISOString();
}

function getSubscriptionCreatedIso(subscriptionCreatedUnix?: number) {
  const unixSeconds = subscriptionCreatedUnix ?? Math.floor(Date.now() / 1000);
  return new Date(unixSeconds * 1000).toISOString();
}

export async function resolveTeamIdFromStripeCustomer(
  stripeCustomerId: string,
) {
  const { data: mapping, error } = await getAdminClient()
    .from("stripe_customers")
    .select("team_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load stripe customer mapping: ${error.message}`);
  }

  if (mapping?.team_id) {
    return mapping.team_id;
  }

  const customer = await stripe.customers.retrieve(stripeCustomerId);

  if ("deleted" in customer) {
    return null;
  }

  const teamId = customer.metadata?.supabase_team_id;
  if (teamId) {
    return teamId;
  }

  // Do NOT fall back to supabase_user_id -> profiles.active_team_id.
  // For multi-team users that fallback can attach a subscription to the
  // wrong team, and the SQL upsert would then silently rewrite team_id.
  return null;
}

export async function upsertStripeCustomer(
  teamId: string,
  stripeCustomerId: string,
) {
  const { error } = await getAdminClient().from("stripe_customers").upsert(
    {
      team_id: teamId,
      stripe_customer_id: stripeCustomerId,
    },
    { onConflict: "team_id" },
  );

  if (error) {
    throw new Error(`Failed to upsert stripe customer: ${error.message}`);
  }
}

export async function syncSubscription(
  subscription: Stripe.Subscription,
  options?: { eventCreatedUnix?: number },
) {
  const status = subscription.status;
  if (!ALL_SUBSCRIPTION_STATUSES.includes(status as (typeof ALL_SUBSCRIPTION_STATUSES)[number])) {
    logger.warn("Ignoring untracked Stripe subscription status during sync", {
      subscriptionId: subscription.id,
      status,
    });
    return;
  }

  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const teamId = await resolveTeamIdFromStripeCustomer(stripeCustomerId);
  if (!teamId) {
    logger.warn("No team mapping found for Stripe customer during sync", {
      stripeCustomerId,
      subscriptionId: subscription.id,
    });
    return;
  }

  const eventCreatedAt = getEventCreatedIso(options?.eventCreatedUnix);
  const subscriptionCreatedAt = getSubscriptionCreatedIso(subscription.created);

  const item = subscription.items.data[0];
  if (!item) {
    logger.warn("Stripe subscription has no items during sync", {
      subscriptionId: subscription.id,
      stripeCustomerId,
      teamId,
    });
    throw new Error(
      `Stripe subscription ${subscription.id} has no items and cannot be synchronized.`,
    );
  }

  const { data, error } = await getAdminClient().rpc("sync_stripe_subscription_atomic", {
    p_team_id: teamId,
    p_stripe_customer_id: stripeCustomerId,
    p_stripe_subscription_id: subscription.id,
    p_stripe_price_id: item.price.id,
    p_seat_quantity: Math.max(1, item.quantity ?? 1),
    p_status: status,
    p_stripe_subscription_created_at: subscriptionCreatedAt,
    p_current_period_start: toIsoOrNull(item.current_period_start),
    p_current_period_end: toIsoOrNull(item.current_period_end),
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_stripe_event_created_at: eventCreatedAt,
  });

  if (error) {
    throw new Error(`Failed to sync subscription transactionally: ${error.message}`);
  }

  const applied = Array.isArray(data) ? data[0] : data;
  if (typeof applied !== "boolean") {
    throw new Error("Unexpected sync rpc response: expected boolean result.");
  }

  if (!applied) {
    logger.warn("Stripe subscription sync ignored stale event", {
      subscriptionId: subscription.id,
      stripeCustomerId,
      teamId,
      eventCreatedAt,
    });
  }
}
