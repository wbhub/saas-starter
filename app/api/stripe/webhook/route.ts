import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeServerClient } from "@/lib/stripe/server";
import {
  syncSubscription,
  upsertStripeCustomer,
} from "@/lib/stripe/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireJsonContentType } from "@/lib/http/content-type";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { logger } from "@/lib/logger";
import {
  WEBHOOK_CLAIM_TTL_SECONDS,
  WEBHOOK_PRUNE_SAMPLE_RATE,
  WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
} from "@/lib/stripe/webhook-constants";
import { pruneStripeWebhookEventRows } from "@/lib/stripe/webhook-event-prune";
import {
  claimWebhookEvent,
  extendWebhookEventClaim,
  markWebhookEventProcessed,
  releaseWebhookEventClaim,
} from "./event-claim";

function getStripeOrThrow() {
  const stripe = getStripeServerClient();
  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }
  return stripe;
}

async function ensureStripeCustomerOwnership(
  teamId: string,
  customerId: string,
) {
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

export async function POST(req: Request) {
  const t = await getRouteTranslator("ApiStripeWebhook", req);

  const stripe = getStripeServerClient();
  if (!stripe) {
    return NextResponse.json(
      { error: t("errors.webhooksNotConfigured") },
      { status: 503 },
    );
  }

  const contentTypeError = requireJsonContentType(req, {
    errorMessage: t("errors.invalidContentType"),
  });
  if (contentTypeError) {
    return contentTypeError;
  }

  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: t("errors.missingSignature") },
      { status: 400 },
    );
  }

  const body = await req.text();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { error: t("errors.webhooksNotConfigured") },
      { status: 503 },
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret,
      WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
    );
  } catch (error) {
    logger.error("Stripe webhook signature verification failed", error);
    return NextResponse.json(
      { error: t("errors.signatureVerificationFailed") },
      { status: 400 },
    );
  }

  let claimed = false;
  let claimToken: string | null = null;
  let claimHeartbeat: ReturnType<typeof setInterval> | null = null;
  try {
    const claim = await claimWebhookEvent(event);
    if (!claim.claimed) {
      return NextResponse.json({ received: true });
    }
    claimed = true;
    claimToken = claim.claimToken;
    if (!claimToken) {
      throw new Error("Webhook event was claimed without a claim token.");
    }
    const activeClaimToken = claimToken;

    const heartbeatIntervalMs = Math.max(
      1_000,
      Math.floor((WEBHOOK_CLAIM_TTL_SECONDS * 1000) / 2),
    );
    claimHeartbeat = setInterval(() => {
      void extendWebhookEventClaim(event.id, activeClaimToken).catch((error) => {
        logger.error("Failed to extend webhook claim heartbeat", error, {
          eventId: event.id,
        });
      });
    }, heartbeatIntervalMs);

    await pruneStripeWebhookEventRows({ sampleRate: WEBHOOK_PRUNE_SAMPLE_RATE });

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

    await markWebhookEventProcessed(event.id, activeClaimToken);
  } catch (error) {
    if (claimHeartbeat) {
      clearInterval(claimHeartbeat);
      claimHeartbeat = null;
    }
    if (claimed && claimToken) {
      await releaseWebhookEventClaim(event.id, claimToken);
    }
    logger.error("Stripe webhook handling failed", error);
    return NextResponse.json(
      { error: t("errors.webhookHandlingFailed") },
      { status: 500 },
    );
  }

  if (claimHeartbeat) {
    clearInterval(claimHeartbeat);
  }

  return NextResponse.json({ received: true });
}
