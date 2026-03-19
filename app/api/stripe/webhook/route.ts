import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe/server";
import { syncSubscription, upsertStripeCustomer } from "@/lib/stripe/sync";
import { createAdminClient } from "@/lib/supabase/admin";

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
    );
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return NextResponse.json(
      { error: "Webhook signature verification failed." },
      { status: 400 },
    );
  }

  try {
    const claim = await claimWebhookEvent(event);
    if (!claim.claimed) {
      return NextResponse.json({ received: true });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        const userId = session.client_reference_id;

        if (customerId && userId) {
          await upsertStripeCustomer(userId, customerId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscription(subscription);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("Stripe webhook handling failed", error);
    return NextResponse.json(
      { error: "Webhook handling failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
