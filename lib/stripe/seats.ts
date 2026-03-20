import { getStripeServerClient } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";
import { syncSubscription } from "@/lib/stripe/sync";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

type LiveSubscriptionRow = {
  stripe_subscription_id: string;
};

function getSeatProrationBehavior() {
  const configured = env.STRIPE_SEAT_PRORATION_BEHAVIOR;
  if (!configured) {
    return "create_prorations" as const;
  }

  if (configured === "create_prorations" || configured === "none") {
    return configured;
  }

  logger.warn("Invalid STRIPE_SEAT_PRORATION_BEHAVIOR configured; using create_prorations", {
    configured,
  });
  return "create_prorations" as const;
}

async function getSeatCount(teamId: string) {
  const { count, error } = await createAdminClient()
    .from("team_memberships")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);

  if (error) {
    throw new Error(`Failed to count team seats: ${error.message}`);
  }

  return Math.max(0, count ?? 0);
}

async function getLiveSubscriptionId(teamId: string) {
  const { data, error } = await createAdminClient()
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("team_id", teamId)
    .in("status", LIVE_SUBSCRIPTION_STATUSES)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle<LiveSubscriptionRow>();

  if (error) {
    throw new Error(`Failed to find live subscription for seat sync: ${error.message}`);
  }

  return data?.stripe_subscription_id ?? null;
}

export async function syncTeamSeatQuantity(
  teamId: string,
  options?: { idempotencyKey?: string },
) {
  const stripe = getStripeServerClient();
  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }

  const liveSubscriptionId = await getLiveSubscriptionId(teamId);

  if (!liveSubscriptionId) {
    return { updated: false as const, reason: "no_live_subscription" as const };
  }

  const seatCount = await getSeatCount(teamId);
  const stripeSubscription = await stripe.subscriptions.retrieve(liveSubscriptionId);
  const firstItem = stripeSubscription.items.data[0];
  if (!firstItem) {
    logger.warn("Live subscription has no items during seat sync", {
      teamId,
      liveSubscriptionId,
    });
    throw new Error(
      `Live subscription ${liveSubscriptionId} has no items and cannot be synchronized.`,
    );
  }

  const currentQuantity = Math.max(0, firstItem.quantity ?? 0);
  if (currentQuantity === seatCount) {
    // Even when seat quantity already matches, refresh local subscription metadata
    // (e.g. plan price/status) so retry workers can heal stale billing rows.
    await syncSubscription(stripeSubscription, {
      eventCreatedUnix: Math.floor(Date.now() / 1000),
    });
    return { updated: false as const, reason: "already_in_sync" as const };
  }

  let updated = await stripe.subscriptions.update(
    stripeSubscription.id,
    {
      items: [
        {
          id: firstItem.id,
          quantity: seatCount,
        },
      ],
      proration_behavior: getSeatProrationBehavior(),
    },
    options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined,
  );

  const confirmedSeatCount = await getSeatCount(teamId);
  if (confirmedSeatCount !== seatCount) {
    updated = await stripe.subscriptions.update(
      stripeSubscription.id,
      {
        items: [
          {
            id: firstItem.id,
            quantity: confirmedSeatCount,
          },
        ],
        proration_behavior: getSeatProrationBehavior(),
      },
      options?.idempotencyKey
        ? { idempotencyKey: `${options.idempotencyKey}:recount` }
        : undefined,
    );
  }

  await syncSubscription(updated, {
    eventCreatedUnix: Math.floor(Date.now() / 1000),
  });

  return {
    updated: true as const,
    previousQuantity: currentQuantity,
    seatCount: confirmedSeatCount,
  };
}
