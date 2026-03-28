import "server-only";

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getStripeServerClient } from "@/lib/stripe/server";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";
import { syncSubscription, upsertStripeCustomer } from "@/lib/stripe/sync";

type StripeCustomerRow = {
  stripe_customer_id: string | null;
};

export type CheckoutSuccessSyncResult =
  | {
      synced: true;
      subscriptionId: string;
    }
  | {
      synced: false;
      reason:
        | "stripe_not_configured"
        | "missing_customer"
        | "missing_subscription"
        | "team_mismatch";
    };

function getSessionTeamId(session: Stripe.Checkout.Session) {
  return session.metadata?.supabase_team_id ?? session.client_reference_id ?? null;
}

function getSubscriptionIdFromSession(session: Stripe.Checkout.Session) {
  return typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
}

function isLiveSubscriptionStatus(status: string) {
  return LIVE_SUBSCRIPTION_STATUSES.includes(
    status as (typeof LIVE_SUBSCRIPTION_STATUSES)[number],
  );
}

async function getTeamStripeCustomerId(teamId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("team_id", teamId)
    .maybeSingle<StripeCustomerRow>();

  if (error) {
    throw new Error(`Failed to load Stripe customer mapping: ${error.message}`);
  }

  return data?.stripe_customer_id ?? null;
}

async function getLatestLiveSubscriptionForCustomer(
  stripe: Stripe,
  teamId: string,
  stripeCustomerId: string,
) {
  const customer = await stripe.customers.retrieve(stripeCustomerId);
  if ("deleted" in customer) {
    return null;
  }

  if (customer.metadata?.supabase_team_id && customer.metadata.supabase_team_id !== teamId) {
    logger.warn("Skipping checkout success sync because Stripe customer is mapped to another team", {
      teamId,
      stripeCustomerId,
      customerTeamId: customer.metadata.supabase_team_id,
    });
    return null;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 100,
  });

  return (
    subscriptions.data
      .filter((subscription) => isLiveSubscriptionStatus(subscription.status))
      .sort((left, right) => right.created - left.created)[0] ?? null
  );
}

export async function syncCheckoutSuccessForTeam(
  teamId: string,
  options?: { sessionId?: string | null },
): Promise<CheckoutSuccessSyncResult> {
  const stripe = getStripeServerClient();
  if (!stripe) {
    return { synced: false, reason: "stripe_not_configured" };
  }

  let subscription: Stripe.Subscription | null = null;

  if (options?.sessionId) {
    const session = await stripe.checkout.sessions.retrieve(options.sessionId);
    const sessionTeamId = getSessionTeamId(session);
    if (!sessionTeamId || sessionTeamId !== teamId) {
      return { synced: false, reason: "team_mismatch" };
    }

    const stripeCustomerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (stripeCustomerId) {
      await upsertStripeCustomer(teamId, stripeCustomerId);
    }

    const subscriptionId = getSubscriptionIdFromSession(session);
    if (subscriptionId) {
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    }
  }

  if (!subscription) {
    const stripeCustomerId = await getTeamStripeCustomerId(teamId);
    if (!stripeCustomerId) {
      return { synced: false, reason: "missing_customer" };
    }

    subscription = await getLatestLiveSubscriptionForCustomer(stripe, teamId, stripeCustomerId);
    if (!subscription) {
      return { synced: false, reason: "missing_subscription" };
    }
  }

  await syncSubscription(subscription, {
    eventCreatedUnix: Math.floor(Date.now() / 1000),
  });

  return {
    synced: true,
    subscriptionId: subscription.id,
  };
}
