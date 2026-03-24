import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { getStripeServerClient } from "@/lib/stripe/server";
import { isBillingEnabled } from "@/lib/billing/capabilities";
import { jsonError } from "@/lib/http/api-json";
import { requireJsonContentType } from "@/lib/http/content-type";
import { getOrCreateRequestId, withRequestId } from "@/lib/http/request-id";
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
  const requestId = getOrCreateRequestId(req);
  const err = (error: string, status: number) => withRequestId(jsonError(error, status), requestId);

  const t = await getRouteTranslator("ApiStripeWebhook", req);

  if (!isBillingEnabled()) {
    return err(t("errors.webhooksNotConfigured"), 503);
  }

  const stripe = getStripeServerClient();
  if (!stripe) {
    return err(t("errors.webhooksNotConfigured"), 503);
  }

  const contentTypeError = requireJsonContentType(req, {
    errorMessage: t("errors.invalidContentType"),
  });
  if (contentTypeError) {
    return withRequestId(contentTypeError, requestId);
  }

  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return err(t("errors.missingSignature"), 400);
  }

  const body = await req.text();
  let webhookSecret: string | undefined;
  try {
    webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  } catch {
    webhookSecret = undefined;
  }
  if (!webhookSecret) {
    return err(t("errors.webhooksNotConfigured"), 503);
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
    return err(t("errors.signatureVerificationFailed"), 400);
  }

  try {
    if (isTriggerConfigured()) {
      const triggered = await triggerStripeWebhookProcessTask({
        eventId: event.id,
      });
      if (triggered) {
        return withRequestId(NextResponse.json({ received: true }), requestId);
      }

      logger.warn(
        "Falling back to inline Stripe webhook processing after Trigger enqueue failure",
        {
          eventId: event.id,
        },
      );
    }

    const processed = await claimAndProcessStripeWebhookEvent(event, {
      pruneSampleRate: WEBHOOK_PRUNE_SAMPLE_RATE,
    });
    if (!processed.processed) {
      return withRequestId(NextResponse.json({ received: true }), requestId);
    }
  } catch (error) {
    logger.error("Stripe webhook handling failed", error);
    return err(t("errors.webhookHandlingFailed"), 500);
  }

  return withRequestId(NextResponse.json({ received: true }), requestId);
}
