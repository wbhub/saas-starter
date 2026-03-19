import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe/server";
import { syncSubscription, upsertStripeCustomer } from "@/lib/stripe/sync";
import { createAdminClient } from "@/lib/supabase/admin";

const WEBHOOK_EVENT_RETENTION_DAYS = 30;
const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;

async function claimWebhookEvent(event: Stripe.Event) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("stripe_webhook_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
  });

  if (!error) {
    return { claimed: true as const };
  }

  if (error.code === "23505") {
    return { claimed: false as const };
  }

  throw new Error(`Failed to claim webhook event: ${error.message}`);
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

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("stripe_webhook_events")
    .delete()
    .lt("processed_at", retentionCutoff);

  if (error) {
    console.error("Failed to prune old webhook events", error);
  }
}

async function releaseWebhookEventClaim(eventId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("stripe_webhook_events")
    .delete()
    .eq("stripe_event_id", eventId);

  if (error) {
    console.error("Failed to release webhook event claim", error);
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
