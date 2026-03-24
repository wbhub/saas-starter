import { env } from "@/lib/env";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { getOrCreateRequestId, withRequestId } from "@/lib/http/request-id";
import { pruneStripeWebhookEventRows } from "@/lib/stripe/webhook-event-prune";
import { timingSafeEqual } from "crypto";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { isTriggerConfigured } from "@/lib/trigger/config";
import { triggerPruneStripeWebhookEventsTask } from "@/lib/trigger/dispatch";
import { logger } from "@/lib/logger";

function bearerToken(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return null;
  }
  return auth.slice("Bearer ".length).trim();
}

function safeCompare(a: string, b: string) {
  if (Buffer.byteLength(a, "utf8") !== Buffer.byteLength(b, "utf8")) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/**
 * Scheduled cleanup for `stripe_webhook_events` (runs the same deletes as the opportunistic
 * prune in the Stripe webhook, but every time). Protect with `CRON_SECRET` via
 * `Authorization: Bearer <CRON_SECRET>` only — never pass secrets in the URL (query strings
 * end up in access logs, browser history, and referrers).
 */
export async function GET(request: Request) {
  const t = await getRouteTranslator("ApiCronPruneStripeWebhookEvents", request);
  const requestId = getOrCreateRequestId(request);
  const err = (error: string, status: number, init?: ResponseInit) =>
    withRequestId(jsonError(error, status, init), requestId);

  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return err(t("errors.cronNotConfigured"), 503);
  }

  const token = bearerToken(request);
  if (!token || !safeCompare(token, secret)) {
    return err(t("errors.unauthorized"), 401);
  }

  const clientId = getClientRateLimitIdentifier(request);
  const rateLimit = await checkRateLimit({
    key: `cron:prune-stripe-webhook-events:${clientId.keyType}:${clientId.value}`,
    ...RATE_LIMITS.cronByClientIp,
  });
  if (!rateLimit.allowed) {
    return err(t("errors.rateLimited"), 429, {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  if (isTriggerConfigured()) {
    const triggered = await triggerPruneStripeWebhookEventsTask();
    if (triggered) {
      return withRequestId(jsonSuccess({ queued: true, mode: "trigger" }), requestId);
    }
    logger.warn("Falling back to inline cron prune after Trigger enqueue failure");
  }

  await pruneStripeWebhookEventRows();
  return withRequestId(jsonSuccess(), requestId);
}
