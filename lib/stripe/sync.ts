import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";

function getAdminClient() {
  return createAdminClient();
}

const TRACKED_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;

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

async function getUserIdFromStripeCustomer(
  stripeCustomerId: string,
) {
  const { data: mapping, error } = await getAdminClient()
    .from("stripe_customers")
    .select("user_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load stripe customer mapping: ${error.message}`);
  }

  if (mapping?.user_id) {
    return mapping.user_id;
  }

  const customer = await stripe.customers.retrieve(stripeCustomerId);

  if ("deleted" in customer) {
    return null;
  }

  const userId = customer.metadata?.supabase_user_id;
  return userId ?? null;
}

export async function upsertStripeCustomer(
  userId: string,
  stripeCustomerId: string,
) {
  const { error } = await getAdminClient().from("stripe_customers").upsert(
    {
      user_id: userId,
      stripe_customer_id: stripeCustomerId,
    },
    { onConflict: "user_id" },
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
  if (!TRACKED_STATUSES.includes(status as (typeof TRACKED_STATUSES)[number])) {
    console.warn("Ignoring untracked Stripe subscription status during sync", {
      subscriptionId: subscription.id,
      status,
    });
    return;
  }

  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const userId = await getUserIdFromStripeCustomer(stripeCustomerId);
  if (!userId) {
    console.warn("No user mapping found for Stripe customer during sync", {
      stripeCustomerId,
      subscriptionId: subscription.id,
    });
    return;
  }

  const eventCreatedAt = getEventCreatedIso(options?.eventCreatedUnix);
  const subscriptionCreatedAt = getSubscriptionCreatedIso(subscription.created);

  const item = subscription.items.data[0];
  if (!item) {
    console.warn("Stripe subscription has no items during sync", {
      subscriptionId: subscription.id,
      stripeCustomerId,
      userId,
    });
    return;
  }

  const { data, error } = await getAdminClient().rpc("sync_stripe_subscription_atomic", {
    p_user_id: userId,
    p_stripe_customer_id: stripeCustomerId,
    p_stripe_subscription_id: subscription.id,
    p_stripe_price_id: item.price.id,
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
    console.warn("Stripe subscription sync ignored stale event", {
      subscriptionId: subscription.id,
      stripeCustomerId,
      userId,
      eventCreatedAt,
    });
  }
}
