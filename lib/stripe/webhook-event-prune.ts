import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  WEBHOOK_CLAIM_TTL_SECONDS,
  WEBHOOK_EVENT_RETENTION_DAYS,
} from "@/lib/stripe/webhook-constants";

/**
 * Deletes old rows from `stripe_webhook_events` (completed past retention, stale claims).
 * When `sampleRate` is below 1, only runs with that probability (for opportunistic prune on webhook traffic).
 */
export async function pruneStripeWebhookEventRows(options?: { sampleRate?: number }) {
  const sampleRate = options?.sampleRate ?? 1;
  if (sampleRate < 1 && Math.random() >= sampleRate) {
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
    logger.error("Failed to prune completed webhook events", completedPruneError);
  }

  const { error: staleClaimPruneError } = await supabase
    .from("stripe_webhook_events")
    .delete()
    .is("completed_at", null)
    .lt("processed_at", staleClaimCutoff);

  if (staleClaimPruneError) {
    logger.error("Failed to prune stale webhook claims", staleClaimPruneError);
  }
}
