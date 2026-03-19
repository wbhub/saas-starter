import { env } from "@/lib/env";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { pruneStripeWebhookEventRows } from "@/lib/stripe/webhook-event-prune";

function bearerToken(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return null;
  }
  return auth.slice("Bearer ".length).trim();
}

/**
 * Scheduled cleanup for `stripe_webhook_events` (runs the same deletes as the opportunistic
 * prune in the Stripe webhook, but every time). Protect with `CRON_SECRET` via
 * `Authorization: Bearer <CRON_SECRET>` only — never pass secrets in the URL (query strings
 * end up in access logs, browser history, and referrers).
 */
export async function GET(request: Request) {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return jsonError("Cron is not configured.", 503);
  }

  const token = bearerToken(request);
  if (!token || token !== secret) {
    return jsonError("Unauthorized.", 401);
  }

  await pruneStripeWebhookEventRows();
  return jsonSuccess();
}
