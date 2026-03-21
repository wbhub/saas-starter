import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { WEBHOOK_CLAIM_TTL_SECONDS } from "@/lib/stripe/webhook-constants";

function createClaimToken() {
  return crypto.randomUUID();
}

export async function claimWebhookEvent(event: Stripe.Event) {
  const supabase = createAdminClient();
  const claimedUntil = new Date(
    Date.now() + WEBHOOK_CLAIM_TTL_SECONDS * 1000,
  ).toISOString();
  const nowIso = new Date().toISOString();
  const claimToken = createClaimToken();
  const claimRow = {
    stripe_event_id: event.id,
    event_type: event.type,
    processed_at: nowIso,
    claim_expires_at: claimedUntil,
    completed_at: null,
    claim_token: claimToken,
  };

  const { error } = await supabase.from("stripe_webhook_events").insert(claimRow);
  if (!error) {
    return { claimed: true as const, claimToken };
  }

  if (error.code !== "23505") {
    throw new Error(`Failed to claim webhook event: ${error.message}`);
  }

  const { data: reclaimedRows, error: reclaimError } = await supabase
    .from("stripe_webhook_events")
    .update({
      event_type: event.type,
      processed_at: nowIso,
      claim_expires_at: claimedUntil,
      completed_at: null,
      claim_token: claimToken,
    })
    .eq("stripe_event_id", event.id)
    .is("completed_at", null)
    .lt("claim_expires_at", nowIso)
    .select("stripe_event_id")
    .limit(1);

  if (reclaimError) {
    throw new Error(`Failed to reclaim stale webhook event claim: ${reclaimError.message}`);
  }

  if ((reclaimedRows ?? []).length > 0) {
    return { claimed: true as const, claimToken };
  }

  return { claimed: false as const, claimToken: null };
}

export async function releaseWebhookEventClaim(eventId: string, claimToken: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      claim_expires_at: new Date().toISOString(),
    })
    .eq("stripe_event_id", eventId)
    .eq("claim_token", claimToken)
    .is("completed_at", null);

  if (error) {
    logger.error("Failed to release webhook event claim", error);
  }
}

export async function extendWebhookEventClaim(eventId: string, claimToken: string) {
  const supabase = createAdminClient();
  const nextClaimExpiresAt = new Date(
    Date.now() + WEBHOOK_CLAIM_TTL_SECONDS * 1000,
  ).toISOString();
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      claim_expires_at: nextClaimExpiresAt,
      processed_at: new Date().toISOString(),
    })
    .eq("stripe_event_id", eventId)
    .eq("claim_token", claimToken)
    .is("completed_at", null);

  if (error) {
    throw new Error(`Failed to extend webhook event claim: ${error.message}`);
  }
}

export async function markWebhookEventProcessed(eventId: string, claimToken: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      completed_at: new Date().toISOString(),
      claim_expires_at: null,
    })
    .eq("stripe_event_id", eventId)
    .eq("claim_token", claimToken)
    .is("completed_at", null);

  if (error) {
    throw new Error(`Failed to finalize webhook event claim: ${error.message}`);
  }
}
