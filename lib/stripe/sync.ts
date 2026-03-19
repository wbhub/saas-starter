import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";

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

const LIVE_SUBSCRIPTION_STATUSES = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
] as const;

function isLiveSubscriptionStatus(status: string) {
  return LIVE_SUBSCRIPTION_STATUSES.includes(
    status as (typeof LIVE_SUBSCRIPTION_STATUSES)[number],
  );
}

function toIsoOrNull(value?: number | null) {
  if (!value) return null;
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
  const supabase = createAdminClient();

  const { data: mapping, error } = await supabase
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
  const supabase = createAdminClient();

  const { error } = await supabase.from("stripe_customers").upsert(
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
    return;
  }

  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const userId = await getUserIdFromStripeCustomer(stripeCustomerId);
  if (!userId) return;

  await upsertStripeCustomer(userId, stripeCustomerId);

  const supabase = createAdminClient();
  const eventCreatedAt = getEventCreatedIso(options?.eventCreatedUnix);
  const subscriptionCreatedAt = getSubscriptionCreatedIso(subscription.created);
  const { data: existingSubscription, error: existingSubscriptionError } = await supabase
    .from("subscriptions")
    .select("stripe_event_created_at")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (existingSubscriptionError) {
    throw new Error(`Failed to load existing subscription row: ${existingSubscriptionError.message}`);
  }

  if (
    existingSubscription?.stripe_event_created_at &&
    existingSubscription.stripe_event_created_at > eventCreatedAt
  ) {
    return;
  }

  const item = subscription.items.data[0];
  if (!item) return;

  if (isLiveSubscriptionStatus(status)) {
    const { data: otherLiveSubscriptions, error: otherLiveSubscriptionsError } =
      await supabase
        .from("subscriptions")
        .select("stripe_subscription_id,stripe_subscription_created_at")
        .eq("user_id", userId)
        .neq("stripe_subscription_id", subscription.id)
        .in("status", [...LIVE_SUBSCRIPTION_STATUSES]);

    if (otherLiveSubscriptionsError) {
      throw new Error(
        `Failed to load competing live subscriptions: ${otherLiveSubscriptionsError.message}`,
      );
    }

    const hasNewerLiveSubscription = (otherLiveSubscriptions ?? []).some((other) => {
      const otherCreatedAt = other.stripe_subscription_created_at;
      if (!otherCreatedAt) {
        return false;
      }

      if (otherCreatedAt > subscriptionCreatedAt) {
        return true;
      }

      if (otherCreatedAt === subscriptionCreatedAt) {
        return other.stripe_subscription_id > subscription.id;
      }

      return false;
    });

    if (hasNewerLiveSubscription) {
      return;
    }

    // Keep one live subscription row per user to match DB invariant.
    const { error: closeOtherLiveSubscriptionsError } = await supabase
      .from("subscriptions")
      .update({
        status: "canceled",
        cancel_at_period_end: true,
      })
      .eq("user_id", userId)
      .neq("stripe_subscription_id", subscription.id)
      .in("status", [...LIVE_SUBSCRIPTION_STATUSES]);

    if (closeOtherLiveSubscriptionsError) {
      throw new Error(
        `Failed to reconcile existing live subscriptions: ${closeOtherLiveSubscriptionsError.message}`,
      );
    }
  }

  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: stripeCustomerId,
      stripe_price_id: item.price.id,
      status: status,
      stripe_subscription_created_at: subscriptionCreatedAt,
      current_period_start: toIsoOrNull(item.current_period_start),
      current_period_end: toIsoOrNull(item.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end,
      stripe_event_created_at: eventCreatedAt,
    },
    { onConflict: "stripe_subscription_id" },
  );

  if (error) {
    throw new Error(`Failed to sync subscription: ${error.message}`);
  }
}
