import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe/server";
import { syncSubscription, upsertStripeCustomer } from "@/lib/stripe/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireJsonContentType } from "@/lib/http/content-type";
import { logger } from "@/lib/logger";
import {
  WEBHOOK_CLAIM_TTL_SECONDS,
  WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
} from "@/lib/stripe/webhook-constants";
import { pruneStripeWebhookEventRows } from "@/lib/stripe/webhook-event-prune";

async function claimWebhookEvent(event: Stripe.Event) {
  const supabase = createAdminClient();
  const claimedUntil = new Date(
    Date.now() + WEBHOOK_CLAIM_TTL_SECONDS * 1000,
  ).toISOString();
  const nowIso = new Date().toISOString();
  const claimRow = {
    stripe_event_id: event.id,
    event_type: event.type,
    processed_at: nowIso,
    claim_expires_at: claimedUntil,
    completed_at: null,
  };

  const { error } = await supabase.from("stripe_webhook_events").insert(claimRow);
  if (!error) {
    return { claimed: true as const };
  }

  if (error.code !== "23505") {
    throw new Error(`Failed to claim webhook event: ${error.message}`);
  }

  const { data: reclaimedRows, error: reclaimError } = await supabase
    .from("stripe_webhook_events")
    .update({
      event_type: event.type,
      processed_at: nowIso,
      claim_expires_at: claimedUntil,
      completed_at: null,
    })
    .eq("stripe_event_id", event.id)
    .is("completed_at", null)
    .lt("claim_expires_at", nowIso)
    .select("stripe_event_id")
    .limit(1);

  if (reclaimError) {
    throw new Error(`Failed to reclaim stale webhook event claim: ${reclaimError.message}`);
  }

  if ((reclaimedRows ?? []).length > 0) {
    return { claimed: true as const };
  }

  return { claimed: false as const };
}

async function releaseWebhookEventClaim(eventId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      claim_expires_at: new Date().toISOString(),
    })
    .eq("stripe_event_id", eventId)
    .is("completed_at", null);

  if (error) {
    logger.error("Failed to release webhook event claim", error);
  }
}

async function markWebhookEventProcessed(eventId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      completed_at: new Date().toISOString(),
      claim_expires_at: null,
    })
    .eq("stripe_event_id", eventId)
    .is("completed_at", null);

  if (error) {
    throw new Error(`Failed to finalize webhook event claim: ${error.message}`);
  }
}

async function ensureStripeCustomerOwnership(
  userId: string,
  customerId: string,
) {
  const customer = await stripe.customers.retrieve(customerId);
  if ("deleted" in customer) {
    throw new Error("Stripe customer was deleted before ownership sync.");
  }

  const currentOwner = customer.metadata?.supabase_user_id;
  if (currentOwner && currentOwner !== userId) {
    throw new Error("Stripe customer ownership metadata mismatch.");
  }

  if (!currentOwner) {
    await stripe.customers.update(customerId, {
      metadata: {
        ...customer.metadata,
        supabase_user_id: userId,
      },
    });
  }
}

export async function POST(req: Request) {
  const contentTypeError = requireJsonContentType(req);
  if (contentTypeError) {
    return contentTypeError;
  }

  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature" },
      { status: 400 },
    );
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
    );
  } catch (error) {
    logger.error("Stripe webhook signature verification failed", error);
    return NextResponse.json(
      { error: "Webhook signature verification failed." },
      { status: 400 },
    );
  }

  let claimed = false;
  try {
    const claim = await claimWebhookEvent(event);
    if (!claim.claimed) {
      return NextResponse.json({ received: true });
    }
    claimed = true;
    await pruneStripeWebhookEventRows({ sampleRate: 0.05 });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        const userId = session.client_reference_id;

        if (customerId && userId) {
          await ensureStripeCustomerOwnership(userId, customerId);
          await upsertStripeCustomer(userId, customerId);
        }

        // Sync the subscription immediately for resilience — don't rely
        // solely on the separate customer.subscription.created event.
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (subscriptionId) {
          const subscription =
            await stripe.subscriptions.retrieve(subscriptionId);
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

    await markWebhookEventProcessed(event.id);
  } catch (error) {
    if (claimed) {
      await releaseWebhookEventClaim(event.id);
    }
    logger.error("Stripe webhook handling failed", error);
    return NextResponse.json(
      { error: "Webhook handling failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
