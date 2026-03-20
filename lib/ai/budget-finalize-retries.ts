import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_ERROR_TEXT_LENGTH = 1_000;
const DEFAULT_BACKGROUND_RETRY_DRAIN_LIMIT = 25;
const DEFAULT_BACKGROUND_RETRY_DRAIN_MIN_INTERVAL_MS = 60_000;
let lastBackgroundRetryDrainAt = 0;

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, MAX_ERROR_TEXT_LENGTH);
  }
  if (typeof error === "string") {
    return error.slice(0, MAX_ERROR_TEXT_LENGTH);
  }
  return "Unknown AI budget finalize failure";
}

async function finalizeTeamAiBudgetClaim(claimId: string, actualTokens: number) {
  const { data, error } = await createAdminClient().rpc("finalize_ai_token_budget_claim", {
    p_claim_id: claimId,
    p_actual_tokens: actualTokens,
  });

  if (error) {
    throw error;
  }

  return data === true;
}

export async function enqueueAiBudgetFinalizeRetry({
  claimId,
  actualTokens,
  error,
}: {
  claimId: string;
  actualTokens: number;
  error: unknown;
}) {
  const { error: rpcError } = await createAdminClient().rpc(
    "enqueue_ai_budget_finalize_retry",
    {
      p_claim_id: claimId,
      p_actual_tokens: Math.max(0, actualTokens),
      p_error: toErrorMessage(error),
    },
  );

  if (rpcError) {
    throw new Error(
      `Failed to enqueue AI budget finalize retry transactionally: ${rpcError.message}`,
    );
  }
}

async function clearAiBudgetFinalizeRetry(claimId: string) {
  const { error } = await createAdminClient()
    .from("ai_budget_claim_finalize_retries")
    .delete()
    .eq("claim_id", claimId);

  if (error) {
    throw new Error(`Failed to clear AI budget finalize retry: ${error.message}`);
  }
}

export async function processDueAiBudgetFinalizeRetries(limit = 100) {
  const nowIso = new Date().toISOString();
  const safeLimit = Math.max(1, limit);
  const { data, error } = await createAdminClient()
    .from("ai_budget_claim_finalize_retries")
    .select("claim_id,actual_tokens")
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(safeLimit);

  if (error) {
    throw new Error(`Failed to load due AI budget finalize retries: ${error.message}`);
  }

  const rows = (data ?? []).filter(
    (row): row is { claim_id: string; actual_tokens: number } =>
      typeof row.claim_id === "string" && typeof row.actual_tokens === "number",
  );

  let finalized = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const applied = await finalizeTeamAiBudgetClaim(row.claim_id, row.actual_tokens);
      await clearAiBudgetFinalizeRetry(row.claim_id);
      if (applied) {
        finalized += 1;
      } else {
        skipped += 1;
      }
    } catch (finalizeError) {
      failed += 1;
      logger.error("Failed to process AI budget finalize retry", finalizeError, {
        claimId: row.claim_id,
      });
      try {
        await enqueueAiBudgetFinalizeRetry({
          claimId: row.claim_id,
          actualTokens: row.actual_tokens,
          error: finalizeError,
        });
      } catch (enqueueError) {
        logger.error("Failed to re-enqueue AI budget finalize retry", enqueueError, {
          claimId: row.claim_id,
        });
      }
    }
  }

  return {
    processed: rows.length,
    finalized,
    skipped,
    failed,
  };
}

export async function maybeProcessAiBudgetFinalizeRetries({
  limit = DEFAULT_BACKGROUND_RETRY_DRAIN_LIMIT,
  minIntervalMs = DEFAULT_BACKGROUND_RETRY_DRAIN_MIN_INTERVAL_MS,
}: {
  limit?: number;
  minIntervalMs?: number;
} = {}) {
  const now = Date.now();
  if (now - lastBackgroundRetryDrainAt < minIntervalMs) {
    return { ran: false as const };
  }
  lastBackgroundRetryDrainAt = now;

  try {
    const summary = await processDueAiBudgetFinalizeRetries(limit);
    return { ran: true as const, summary };
  } catch (error) {
    logger.warn("Best-effort AI budget finalize retry drain failed", {
      error,
    });
    return { ran: true as const, failed: true as const };
  }
}
