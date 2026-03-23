import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  WEBHOOK_CLAIM_TTL_SECONDS,
  WEBHOOK_PRUNE_SAMPLE_RATE,
} from "@/lib/stripe/webhook-constants";
import {
  syncSubscription,
  upsertStripeCustomer,
} from "@/lib/stripe/sync";
import { getStripeServerClient } from "@/lib/stripe/server";
import { pruneStripeWebhookEventRows } from "@/lib/stripe/webhook-event-prune";
import {
  claimWebhookEvent,
  extendWebhookEventClaim,
  markWebhookEventProcessed,
  releaseWebhookEventClaim,
} from "@/app/api/stripe/webhook/event-claim";

function getStripeOrThrow() {
  const stripe = getStripeServerClient();
  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }
  return stripe;
}

async function ensureStripeCustomerOwnership(teamId: string, customerId: string) {
  const stripe = getStripeOrThrow();
  const customer = await stripe.customers.retrieve(customerId);
  if ("deleted" in customer) {
    throw new Error("Stripe customer was deleted before ownership sync.");
  }

  const currentOwner = customer.metadata?.supabase_team_id;
  if (currentOwner && currentOwner !== teamId) {
    throw new Error("Stripe customer ownership metadata mismatch.");
  }

  if (!currentOwner) {
    await stripe.customers.update(customerId, {
      metadata: {
        ...customer.metadata,
        supabase_team_id: teamId,
      },
    });
  }
}

async function resolveTeamIdFromSessionReference(referenceId: string) {
  const supabase = createAdminClient();
  const teamLookup = await supabase
    .from("teams")
    .select("id")
    .eq("id", referenceId)
    .maybeSingle<{ id: string }>();

  if (teamLookup.error) {
    throw new Error(`Failed to resolve checkout reference as team: ${teamLookup.error.message}`);
  }

  if (teamLookup.data?.id) {
    return teamLookup.data.id;
  }

  return null;
}

export async function processStripeWebhookEvent(event: Stripe.Event) {
  const stripe = getStripeOrThrow();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;
      const metadata = session.metadata ?? {};
      let teamId: string | null = metadata.supabase_team_id ?? null;
      const sessionReferenceId = session.client_reference_id;

      if (!teamId && sessionReferenceId) {
        // Only allow direct team id references. Falling back to user id can
        // attach billing to the wrong team when users belong to multiple teams.
        teamId = await resolveTeamIdFromSessionReference(sessionReferenceId);
      }

      if (!teamId) {
        throw new Error(
          `Checkout session ${session.id} is missing supabase_team_id metadata.`,
        );
      }

      if (customerId && teamId) {
        await ensureStripeCustomerOwnership(teamId, customerId);
        await upsertStripeCustomer(teamId, customerId);
      }

      // Sync the subscription immediately for resilience — don't rely
      // solely on the separate customer.subscription.created event.
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(subscription, {
          eventCreatedUnix: event.created,
        });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await syncSubscription(subscription, {
        eventCreatedUnix: event.created,
      });
      break;
    }
    default:
      break;
  }
}

export async function processClaimedStripeWebhookEvent(
  event: Stripe.Event,
  claimToken: string,
  options?: { pruneSampleRate?: number },
) {
  const heartbeatIntervalMs = Math.max(
    1_000,
    Math.floor((WEBHOOK_CLAIM_TTL_SECONDS * 1000) / 2),
  );
  let claimHeartbeat: ReturnType<typeof setInterval> | null = null;
  const pruneSampleRate = options?.pruneSampleRate ?? WEBHOOK_PRUNE_SAMPLE_RATE;

  try {
    claimHeartbeat = setInterval(() => {
      void extendWebhookEventClaim(event.id, claimToken).catch((error) => {
        logger.error("Failed to extend webhook claim heartbeat", error, {
          eventId: event.id,
        });
      });
    }, heartbeatIntervalMs);

    await pruneStripeWebhookEventRows({ sampleRate: pruneSampleRate });
    await processStripeWebhookEvent(event);
    await markWebhookEventProcessed(event.id, claimToken);
  } catch (error) {
    await releaseWebhookEventClaim(event.id, claimToken);
    throw error;
  } finally {
    if (claimHeartbeat) {
      clearInterval(claimHeartbeat);
    }
  }
}

export async function claimAndProcessStripeWebhookEvent(
  event: Stripe.Event,
  options?: { pruneSampleRate?: number },
) {
  const claim = await claimWebhookEvent(event);
  if (!claim.claimed || !claim.claimToken) {
    return { processed: false as const };
  }

  await processClaimedStripeWebhookEvent(event, claim.claimToken, options);
  return { processed: true as const };
}

export async function claimAndProcessStripeWebhookEventById(
  eventId: string,
  options?: { pruneSampleRate?: number },
) {
  const stripe = getStripeOrThrow();
  const event = await stripe.events.retrieve(eventId);
  return claimAndProcessStripeWebhookEvent(event, options);
}
