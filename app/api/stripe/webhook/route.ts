import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe/server";
import { syncSubscription, upsertStripeCustomer } from "@/lib/stripe/sync";
import { createAdminClient } from "@/lib/supabase/admin";

const WEBHOOK_EVENT_RETENTION_DAYS = 30;
const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;
const WEBHOOK_CLAIM_TTL_SECONDS = 5 * 60;

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

  const { data: existing, error: loadError } = await supabase
    .from("stripe_webhook_events")
    .select("completed_at,claim_expires_at")
    .eq("stripe_event_id", event.id)
    .maybeSingle<{
      completed_at: string | null;
      claim_expires_at: string | null;
    }>();
  if (loadError) {
    throw new Error(`Failed to inspect webhook event claim: ${loadError.message}`);
  }

  if (!existing || existing.completed_at) {
    return { claimed: false as const };
  }

  if (existing.claim_expires_at && existing.claim_expires_at > nowIso) {
    return { claimed: false as const };
  }

  const { error: clearStaleError } = await supabase
    .from("stripe_webhook_events")
    .delete()
    .eq("stripe_event_id", event.id)
    .is("completed_at", null)
    .lt("claim_expires_at", nowIso);
  if (clearStaleError) {
    throw new Error(`Failed to clear stale webhook claim: ${clearStaleError.message}`);
  }

  const { error: retryError } = await supabase
    .from("stripe_webhook_events")
    .insert(claimRow);
  if (!retryError) {
    return { claimed: true as const };
  }
  if (retryError.code === "23505") {
    return { claimed: false as const };
  }

  throw new Error(`Failed to claim webhook event after stale clear: ${retryError.message}`);
}

async function pruneOldWebhookEvents() {
  // Keep dedupe rows bounded. This runs opportunistically during webhook traffic.
  const shouldPrune = Math.random() < 0.05;
  if (!shouldPrune) {
    return;
  }

  const retentionCutoff = new Date(
    Date.now() - WEBHOOK_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const staleClaimCutoff = new Date(
    Date.now() - WEBHOOK_CLAIM_TTL_SECONDS * 2 * 1000,
  ).toISOString();

  const supabase = createAdminClient();
  const { error: completedPruneError } = await supabase
    .from("stripe_webhook_events")
    .delete()
    .not("completed_at", "is", null)
    .lt("completed_at", retentionCutoff);

  if (completedPruneError) {
    console.error("Failed to prune completed webhook events", completedPruneError);
  }

  const { error: staleClaimPruneError } = await supabase
    .from("stripe_webhook_events")
    .delete()
    .is("completed_at", null)
    .lt("processed_at", staleClaimCutoff);

  if (staleClaimPruneError) {
    console.error("Failed to prune stale webhook claims", staleClaimPruneError);
  }
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
    console.error("Failed to release webhook event claim", error);
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
    console.error("Stripe webhook signature verification failed", error);
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
    await pruneOldWebhookEvents();

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
    console.error("Stripe webhook handling failed", error);
    return NextResponse.json(
      { error: "Webhook handling failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
