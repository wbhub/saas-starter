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
 * prune in the Stripe webhook, but every time). Protect with `CRON_SECRET`: call with
 * `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>` (for providers that cannot set headers).
 */
export async function GET(request: Request) {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return jsonError("Cron is not configured.", 503);
  }

  const token =
    bearerToken(request) ?? new URL(request.url).searchParams.get("secret")?.trim();
  if (!token || token !== secret) {
    return jsonError("Unauthorized.", 401);
  }

  await pruneStripeWebhookEventRows();
  return jsonSuccess();
}
