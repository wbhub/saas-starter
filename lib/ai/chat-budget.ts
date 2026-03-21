import { enqueueAiBudgetFinalizeRetry } from "@/lib/ai/budget-finalize-retries";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export type BudgetClaim = {
  claimId: string;
  monthStart: string;
};

type FinalizeRetryContext = {
  teamId: string;
  userId: string;
  model: string;
};

function getMonthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function claimTeamAiBudget({
  teamId,
  tokenBudget,
  projectedTokens,
}: {
  teamId: string;
  tokenBudget: number;
  projectedTokens: number;
}): Promise<BudgetClaim | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_ai_token_budget", {
    p_team_id: teamId,
    p_month_start: getMonthStartIso(),
    p_token_budget: tokenBudget,
    p_projected_tokens: projectedTokens,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.allowed !== true || typeof row.claim_id !== "string") {
    return null;
  }

  return {
    claimId: row.claim_id,
    monthStart: row.month_start,
  };
}

export async function finalizeTeamAiBudgetClaim({
  claimId,
  actualTokens,
}: {
  claimId: string;
  actualTokens: number;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("finalize_ai_token_budget_claim", {
    p_claim_id: claimId,
    p_actual_tokens: actualTokens,
  });

  if (error) {
    throw error;
  }
}

export async function finalizeTeamAiBudgetClaimWithRetry({
  claimId,
  actualTokens,
  context,
  onFinalizeFailureMessage,
  onEnqueueFailureMessage,
}: {
  claimId: string;
  actualTokens: number;
  context: FinalizeRetryContext;
  onFinalizeFailureMessage: string;
  onEnqueueFailureMessage: string;
}) {
  try {
    await finalizeTeamAiBudgetClaim({ claimId, actualTokens });
    return true;
  } catch (error) {
    logger.error(onFinalizeFailureMessage, error, {
      ...context,
      claimId,
      actualTokens,
    });
    try {
      await enqueueAiBudgetFinalizeRetry({
        claimId,
        actualTokens,
        error,
      });
    } catch (enqueueError) {
      logger.error(onEnqueueFailureMessage, enqueueError, {
        ...context,
        claimId,
      });
    }
    return false;
  }
}
