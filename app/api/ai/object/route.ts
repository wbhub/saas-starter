import { streamObject, type LanguageModelUsage } from "ai";
import { withRequestId } from "@/lib/http/request-id";
import { finalizeTeamAiBudgetClaimWithRetry } from "@/lib/ai/chat-budget";
import { logAuditEvent } from "@/lib/audit";
import { resolveActualTokenUsage } from "@/lib/ai/usage";
import { z } from "@/lib/http/request-validation";
import { logger } from "@/lib/logger";
import { AI_SCHEMA_MAP } from "@/lib/ai/schemas";
import {
  resolveAiRequestContext,
  mapUpstreamError,
  aiErrorResponse,
  insertAiUsageRow,
  recordAiUsageMonthlyTotals,
} from "@/lib/ai/request-context";

const AI_OBJECT_MAX_TOKENS = 2_048;

const objectPayloadSchema = z.object({
  schemaName: z.string().trim().min(1).max(100),
  prompt: z.string().trim().min(1).max(8_000),
});

export async function POST(request: Request) {
  const result = await resolveAiRequestContext(request, {
    i18nNamespace: "ApiAiObject",
    bodySchema: objectPayloadSchema,
    rateLimitKeys: { user: "aiObjectByUser", team: "aiObjectByTeam", prefix: "ai-object" },
    auditAction: "ai.object.request",
    estimatePromptTokens: (body) => Math.ceil(body.prompt.length / 3) + 500,
    maxCompletionTokens: AI_OBJECT_MAX_TOKENS,
    skipTools: true,
  });

  if (!result.ok) {
    return result.response;
  }

  const {
    requestId,
    user,
    teamContext,
    body,
    model,
    providerName,
    languageModel,
    effectivePlanKey,
    aiAccessMode,
    budgetClaim,
    projectedRequestTokens,
    estimatedPromptTokens,
    t,
  } = result.ctx;

  // ── Look up the requested schema ──
  const schemaEntry = Object.hasOwn(AI_SCHEMA_MAP, body.schemaName)
    ? AI_SCHEMA_MAP[body.schemaName]
    : undefined;
  if (!schemaEntry) {
    return aiErrorResponse({
      error: t("errors.unknownSchema"),
      code: "unknown_schema",
      status: 400,
      requestId,
    });
  }

  // ── Upstream error message helpers ──
  const aiUnavailableMessage = t("errors.unavailable");
  const upstreamRateLimitedMessage = t("errors.upstreamRateLimited");
  const upstreamBadRequestMessage = t("errors.upstreamBadRequest");

  let finalized = false;

  async function finalizeObjectStream(
    promptTokens: number,
    completionTokens: number,
    outcome: "success" | "failure",
    reason?: string,
  ) {
    if (finalized) return;
    finalized = true;

    const resolvedUsage = resolveActualTokenUsage({
      promptTokens,
      completionTokens,
      projectedRequestTokens,
      estimatedPromptTokens,
      streamedCompletionChars: 0,
    });

    if (budgetClaim) {
      try {
        await finalizeTeamAiBudgetClaimWithRetry({
          claimId: budgetClaim.claimId,
          actualTokens: resolvedUsage.actualTokens,
          context: { teamId: teamContext.teamId, userId: user.id, model },
          onFinalizeFailureMessage: "Failed to finalize AI budget claim (object)",
          onEnqueueFailureMessage:
            "Failed to enqueue AI budget finalize retry after object stream finalization error",
        });
      } catch (finalizeError) {
        logger.error("Failed to finalize AI budget claim in object stream", finalizeError, {
          teamId: teamContext.teamId,
          userId: user.id,
          model,
          claimId: budgetClaim.claimId,
        });
      }
    }

    if (outcome === "success") {
      try {
        await insertAiUsageRow({
          teamId: teamContext.teamId,
          userId: user.id,
          model,
          promptTokens: resolvedUsage.promptTokens,
          completionTokens: resolvedUsage.completionTokens,
        });
        if (!budgetClaim) {
          await recordAiUsageMonthlyTotals({
            teamId: teamContext.teamId,
            actualTokens: resolvedUsage.actualTokens,
          });
        }
      } catch (error) {
        logger.error("Failed to persist AI usage bookkeeping (object)", error, {
          teamId: teamContext.teamId,
          userId: user.id,
          model,
          promptTokens: resolvedUsage.promptTokens,
          completionTokens: resolvedUsage.completionTokens,
        });
      }
    }

    logAuditEvent({
      action: "ai.object.request",
      outcome,
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: {
        planKey: effectivePlanKey,
        accessMode: aiAccessMode,
        model,
        schemaName: body.schemaName,
        requestModalities: ["text"],
        budgetClaimId: budgetClaim?.claimId,
        promptTokens: resolvedUsage.promptTokens,
        completionTokens: resolvedUsage.completionTokens,
        usageFallbackApplied: resolvedUsage.usedFallback,
        ...(reason ? { reason } : {}),
      },
    });
  }

  try {
    const aiResult = streamObject({
      model: languageModel,
      schema: schemaEntry.schema,
      prompt: `${schemaEntry.description}\n\n${body.prompt}`,
      maxOutputTokens: AI_OBJECT_MAX_TOKENS,
      onFinish: async ({ usage: finishUsage }: { usage: LanguageModelUsage }) => {
        await finalizeObjectStream(
          finishUsage.inputTokens ?? 0,
          finishUsage.outputTokens ?? 0,
          "success",
        );
      },
      onError: async ({ error }: { error: unknown }) => {
        logger.error("Object stream error", error, {
          teamId: teamContext.teamId,
          userId: user.id,
          model,
          schemaName: body.schemaName,
        });
        await finalizeObjectStream(0, 0, "failure", "stream_failed");
      },
    });

    return withRequestId(
      aiResult.toTextStreamResponse({
        headers: { "Cache-Control": "no-store" },
      }),
      requestId,
    );
  } catch (error) {
    const upstreamError = mapUpstreamError(error);
    logger.error("Failed to create AI object stream", error, {
      teamId: teamContext.teamId,
      userId: user.id,
      model,
      schemaName: body.schemaName,
      aiProvider: providerName,
      providerStatus: (error as { status?: number } | null)?.status,
      providerCode: (error as { code?: string } | null)?.code,
      providerType: (error as { type?: string } | null)?.type,
    });
    await finalizeObjectStream(0, 0, "failure", upstreamError.auditReason);
    const upstreamMessage =
      upstreamError.code === "upstream_rate_limited"
        ? upstreamRateLimitedMessage
        : upstreamError.code === "upstream_bad_request"
          ? upstreamBadRequestMessage
          : aiUnavailableMessage;
    return aiErrorResponse({
      error: upstreamMessage,
      code: upstreamError.code,
      status: upstreamError.status,
      requestId,
    });
  }
}
