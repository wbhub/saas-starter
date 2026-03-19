import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";

const ACTIVE_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
] as const;

function toIsoOrNull(value?: number | null) {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
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

export async function syncSubscription(subscription: Stripe.Subscription) {
  const status = subscription.status;
  if (!ACTIVE_STATUSES.includes(status as (typeof ACTIVE_STATUSES)[number])) {
    return;
  }

  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const userId = await getUserIdFromStripeCustomer(stripeCustomerId);
  if (!userId) return;

  await upsertStripeCustomer(userId, stripeCustomerId);

  const item = subscription.items.data[0];
  if (!item) return;

  const supabase = createAdminClient();
  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: stripeCustomerId,
      stripe_price_id: item.price.id,
      status: status,
      current_period_start: toIsoOrNull(item.current_period_start),
      current_period_end: toIsoOrNull(item.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end,
    },
    { onConflict: "stripe_subscription_id" },
  );

  if (error) {
    throw new Error(`Failed to sync subscription: ${error.message}`);
  }
}
