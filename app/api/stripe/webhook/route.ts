import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeServerClient } from "@/lib/stripe/server";
import { isBillingEnabled } from "@/lib/billing/capabilities";
import { requireJsonContentType } from "@/lib/http/content-type";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { logger } from "@/lib/logger";
import {
  WEBHOOK_PRUNE_SAMPLE_RATE,
  WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
} from "@/lib/stripe/webhook-constants";
import { claimAndProcessStripeWebhookEvent } from "@/lib/stripe/webhook-processing";
import { isTriggerConfigured } from "@/lib/trigger/config";
import { triggerStripeWebhookProcessTask } from "@/lib/trigger/dispatch";

export async function POST(req: Request) {
  const t = await getRouteTranslator("ApiStripeWebhook", req);

  if (!isBillingEnabled()) {
    return NextResponse.json(
      { error: t("errors.webhooksNotConfigured") },
      { status: 503 },
    );
  }

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

  try {
    if (isTriggerConfigured()) {
      const triggered = await triggerStripeWebhookProcessTask({
        eventId: event.id,
      });
      if (triggered) {
        return NextResponse.json({ received: true });
      }

      logger.warn("Falling back to inline Stripe webhook processing after Trigger enqueue failure", {
        eventId: event.id,
      });
    }

    const processed = await claimAndProcessStripeWebhookEvent(event, {
      pruneSampleRate: WEBHOOK_PRUNE_SAMPLE_RATE,
    });
    if (!processed.processed) {
      return NextResponse.json({ received: true });
    }
  } catch (error) {
    logger.error("Stripe webhook handling failed", error);
    return NextResponse.json(
      { error: t("errors.webhookHandlingFailed") },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
