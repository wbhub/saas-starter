import { NextResponse } from "next/server";
import {
  enqueueAiBudgetFinalizeRetry,
  maybeProcessAiBudgetFinalizeRetries,
} from "@/lib/ai/budget-finalize-retries";
import {
  getAiAccessMode,
  getAiAllowedSubscriptionStatuses,
} from "@/lib/ai/config";
import { logAuditEvent } from "@/lib/audit";
import { resolveEffectivePlanKey } from "@/lib/billing/effective-plan";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { resolveActualTokenUsage } from "@/lib/ai/usage";
import { resolveAiAccess } from "@/lib/ai/access";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { logger } from "@/lib/logger";
import { isOpenAiConfigured, openai } from "@/lib/openai/client";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { LIVE_SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "@/lib/stripe/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getTeamContextForUser } from "@/lib/team-context";

const AI_COMPLETION_MAX_TOKENS = 4_096;
const AI_UNAVAILABLE_MESSAGE = "AI assistant is currently unavailable.";
const AI_UNAVAILABLE_STATUS = 503;

const chatPayloadSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(8_000),
      }),
    )
    .min(1)
    .max(30),
});

type UsageTotals = {
  promptTokens: number;
  completionTokens: number;
};

type BudgetClaim = {
  claimId: string;
  monthStart: string;
};

type OpenAiErrorInfo = {
  auditReason: string;
};

function estimatePromptTokens(messages: Array<{ content: string }>) {
  const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  return Math.ceil(totalChars / 3) + messages.length * 8;
}

function getMonthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function claimTeamAiBudget({
  teamId,
  tokenBudget,
  projectedTokens,
}: {
  teamId: string;
  tokenBudget: number;
  projectedTokens: number;
}): Promise<BudgetClaim | null> {
  if (process.env.NODE_ENV === "test") {
    return {
      claimId: "test-claim",
      monthStart: getMonthStartIso(),
    };
  }

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

async function finalizeTeamAiBudgetClaim({
  claimId,
  actualTokens,
}: {
  claimId: string;
  actualTokens: number;
}) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("finalize_ai_token_budget_claim", {
    p_claim_id: claimId,
    p_actual_tokens: actualTokens,
  });

  if (error) {
    throw error;
  }
}

function mapOpenAiError(error: unknown): OpenAiErrorInfo {
  const maybeError = error as {
    status?: number;
    code?: string;
    type?: string;
    name?: string;
  } | null;
  const status = maybeError?.status;
  const code = maybeError?.code;
  const name = maybeError?.name;

  if (status === 429 || code === "rate_limit_exceeded") {
    return {
      auditReason: "openai_rate_limited",
    };
  }

  if (status === 400 || status === 422) {
    return {
      auditReason: "openai_bad_request",
    };
  }

  if (status === 408 || status === 504 || name === "APIConnectionTimeoutError") {
    return {
      auditReason: "openai_timeout",
    };
  }

  if (status !== undefined && status >= 500) {
    return {
      auditReason: "openai_upstream_error",
    };
  }

  return {
    auditReason: "openai_create_failed",
  };
}

async function insertAiUsageRow({
  teamId,
  userId,
  model,
  promptTokens,
  completionTokens,
}: {
  teamId: string;
  userId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("ai_usage").insert({
    team_id: teamId,
    user_id: userId,
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
  });

  if (error) {
    throw error;
  }
}

export async function POST(request: Request) {
  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamContext = await getTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return NextResponse.json(
      { error: "No team membership found for this account." },
      { status: 403 },
    );
  }

  const userRateLimitPromise = checkRateLimit({
    key: `ai-chat:user:${user.id}`,
    ...RATE_LIMITS.aiChatByUser,
  });
  const teamRateLimitPromise = checkRateLimit({
    key: `ai-chat:team:${teamContext.teamId}`,
    ...RATE_LIMITS.aiChatByTeam,
  });
  const [userRateLimit, teamRateLimit] = await Promise.all([
    userRateLimitPromise,
    teamRateLimitPromise,
  ]);
  if (!userRateLimit.allowed || !teamRateLimit.allowed) {
    const retryAfterSeconds = Math.max(
      userRateLimit.retryAfterSeconds,
      teamRateLimit.retryAfterSeconds,
    );
    return NextResponse.json(
      { error: "Too many AI requests. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      },
    );
  }

  const bodyParse = await parseJsonWithSchema(request, chatPayloadSchema);
  if (!bodyParse.success) {
    if (bodyParse.tooLarge) {
      return NextResponse.json({ error: "Request payload is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const aiAccessMode = getAiAccessMode();
  if (aiAccessMode === "paid") {
    const allowedStatuses = getAiAllowedSubscriptionStatuses();
    if (!allowedStatuses.length) {
      logAuditEvent({
        action: "ai.chat.request",
        outcome: "denied",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        metadata: { reason: "ai_statuses_not_configured", accessMode: aiAccessMode },
      });
      return NextResponse.json(
        { error: AI_UNAVAILABLE_MESSAGE },
        { status: AI_UNAVAILABLE_STATUS },
      );
    }
  }

  let subscriptionRow: { stripe_price_id: string | null; status: SubscriptionStatus | null } | null = null;
  if (aiAccessMode !== "all") {
    let subscriptionQuery = supabase
      .from("subscriptions")
      .select("stripe_price_id,status")
      .eq("team_id", teamContext.teamId)
      .in("status", LIVE_SUBSCRIPTION_STATUSES);

    if (aiAccessMode === "paid") {
      subscriptionQuery = subscriptionQuery.in("status", getAiAllowedSubscriptionStatuses());
    }

    const { data, error: subscriptionError } = await subscriptionQuery
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle<{ stripe_price_id: string | null; status: SubscriptionStatus | null }>();

    if (subscriptionError) {
      logger.error("Failed to load subscription for AI chat request", subscriptionError, {
        teamId: teamContext.teamId,
        userId: user.id,
        accessMode: aiAccessMode,
      });
      return NextResponse.json(
        { error: AI_UNAVAILABLE_MESSAGE },
        { status: AI_UNAVAILABLE_STATUS },
      );
    }

    subscriptionRow = data;
  }

  const effectivePlanKey = resolveEffectivePlanKey(subscriptionRow);
  const aiAccess = resolveAiAccess({ effectivePlanKey });
  if (!aiAccess.allowed || !aiAccess.model) {
    logAuditEvent({
      action: "ai.chat.request",
      outcome: "denied",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: {
        reason: aiAccess.denialReason ?? "plan_not_allowed",
        accessMode: aiAccessMode,
        effectivePlanKey,
        stripePriceId: subscriptionRow?.stripe_price_id ?? null,
      },
    });
    return NextResponse.json(
      {
        error: AI_UNAVAILABLE_MESSAGE,
      },
      { status: AI_UNAVAILABLE_STATUS },
    );
  }

  if (!isOpenAiConfigured || !openai) {
    logAuditEvent({
      action: "ai.chat.request",
      outcome: "denied",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: {
        reason: "ai_not_configured",
        planKey: effectivePlanKey,
        accessMode: aiAccessMode,
        model: aiAccess.model,
      },
    });
    return NextResponse.json(
      { error: AI_UNAVAILABLE_MESSAGE },
      { status: AI_UNAVAILABLE_STATUS },
    );
  }

  const model = aiAccess.model;
  const monthlyTokenBudget = aiAccess.monthlyTokenBudget;
  const estimatedPromptTokens = estimatePromptTokens(bodyParse.data.messages);
  const projectedRequestTokens = estimatedPromptTokens + AI_COMPLETION_MAX_TOKENS;
  let budgetClaim: BudgetClaim | null = null;
  if (monthlyTokenBudget > 0) {
    try {
      budgetClaim = await claimTeamAiBudget({
        teamId: teamContext.teamId,
        tokenBudget: monthlyTokenBudget,
        projectedTokens: projectedRequestTokens,
      });
    } catch (error) {
      logger.error("Failed to atomically claim team AI budget", error, {
        teamId: teamContext.teamId,
        userId: user.id,
        planKey: effectivePlanKey,
        accessMode: aiAccessMode,
        monthlyTokenBudget,
        projectedRequestTokens,
      });
      return NextResponse.json(
        { error: AI_UNAVAILABLE_MESSAGE },
        { status: AI_UNAVAILABLE_STATUS },
      );
    }

    if (!budgetClaim) {
      logAuditEvent({
        action: "ai.chat.request",
        outcome: "denied",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        metadata: {
          reason: "team_token_budget_exceeded",
          planKey: effectivePlanKey,
          accessMode: aiAccessMode,
          monthlyTokenBudget,
          projectedRequestTokens,
        },
      });
      return NextResponse.json(
        { error: AI_UNAVAILABLE_MESSAGE },
        { status: AI_UNAVAILABLE_STATUS },
      );
    }
  }

  // Best-effort queue healing so finalize retries do not depend solely on cron.
  // Run only on the active AI execution path to avoid unnecessary background work.
  if (budgetClaim) {
    void maybeProcessAiBudgetFinalizeRetries();
  }

  try {
    const upstreamAbortController = new AbortController();
    request.signal.addEventListener(
      "abort",
      () => {
        upstreamAbortController.abort("client_disconnected");
      },
      { once: true },
    );

    const stream = await openai.chat.completions.create({
      model,
      stream: true,
      max_tokens: AI_COMPLETION_MAX_TOKENS,
      stream_options: { include_usage: true },
      messages: bodyParse.data.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    }, { signal: upstreamAbortController.signal });

    const encoder = new TextEncoder();
    const usage: UsageTotals = { promptTokens: 0, completionTokens: 0 };
    let streamedCompletionChars = 0;

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        let streamError: unknown | null = null;

        try {
          for await (const chunk of stream) {
            if (chunk.usage) {
              usage.promptTokens = chunk.usage.prompt_tokens ?? 0;
              usage.completionTokens = chunk.usage.completion_tokens ?? 0;
            }

            const delta = chunk.choices[0]?.delta?.content;
            if (!delta) {
              continue;
            }

            controller.enqueue(encoder.encode(delta));
            streamedCompletionChars += delta.length;
          }
          controller.close();
        } catch (error) {
          streamError = error;
          logger.error("Failed to stream AI chat completion", error, {
            teamId: teamContext.teamId,
            userId: user.id,
            model,
          });
          controller.error(error);
        } finally {
          const resolvedUsage = resolveActualTokenUsage({
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            projectedRequestTokens,
            estimatedPromptTokens,
            streamedCompletionChars,
          });
          if (resolvedUsage.usedFallback && !streamError) {
            logger.warn("AI stream completed without usage metadata; applying fallback usage", {
              teamId: teamContext.teamId,
              userId: user.id,
              model,
              projectedRequestTokens,
            });
          }
          if (budgetClaim) {
            try {
              await finalizeTeamAiBudgetClaim({
                claimId: budgetClaim.claimId,
                actualTokens: resolvedUsage.actualTokens,
              });
            } catch (error) {
              logger.error("Failed to finalize AI budget claim", error, {
                teamId: teamContext.teamId,
                userId: user.id,
                model,
                claimId: budgetClaim.claimId,
                actualTokens: resolvedUsage.actualTokens,
              });
              try {
                await enqueueAiBudgetFinalizeRetry({
                  claimId: budgetClaim.claimId,
                  actualTokens: resolvedUsage.actualTokens,
                  error,
                });
              } catch (enqueueError) {
                logger.error(
                  "Failed to enqueue AI budget finalize retry after stream finalization error",
                  enqueueError,
                  {
                    teamId: teamContext.teamId,
                    userId: user.id,
                    model,
                    claimId: budgetClaim.claimId,
                  },
                );
              }
            }
          }

          try {
            await insertAiUsageRow({
              teamId: teamContext.teamId,
              userId: user.id,
              model,
              promptTokens: resolvedUsage.promptTokens,
              completionTokens: resolvedUsage.completionTokens,
            });
          } catch (error) {
            logger.error("Failed to persist AI usage row", error, {
              teamId: teamContext.teamId,
              userId: user.id,
              model,
              promptTokens: resolvedUsage.promptTokens,
              completionTokens: resolvedUsage.completionTokens,
            });
          }

          if (streamError) {
            logAuditEvent({
              action: "ai.chat.request",
              outcome: "failure",
              actorUserId: user.id,
              teamId: teamContext.teamId,
              metadata: {
                planKey: effectivePlanKey,
                accessMode: aiAccessMode,
                model,
                reason: "stream_failed",
              },
            });
            return;
          }

          logAuditEvent({
            action: "ai.chat.request",
            outcome: "success",
            actorUserId: user.id,
            teamId: teamContext.teamId,
            metadata: {
              planKey: effectivePlanKey,
              accessMode: aiAccessMode,
              model,
              budgetClaimId: budgetClaim?.claimId,
              promptTokens: resolvedUsage.promptTokens,
              completionTokens: resolvedUsage.completionTokens,
              usageFallbackApplied: resolvedUsage.usedFallback,
            },
          });
        }
      },
      cancel() {
        upstreamAbortController.abort("downstream_cancelled");
      },
    });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (budgetClaim) {
      try {
        await finalizeTeamAiBudgetClaim({
          claimId: budgetClaim.claimId,
          actualTokens: 0,
        });
      } catch (finalizeError) {
        logger.error("Failed to release AI budget claim after create failure", finalizeError, {
          teamId: teamContext.teamId,
          userId: user.id,
          model,
          claimId: budgetClaim.claimId,
        });
        try {
          await enqueueAiBudgetFinalizeRetry({
            claimId: budgetClaim.claimId,
            actualTokens: 0,
            error: finalizeError,
          });
        } catch (enqueueError) {
          logger.error(
            "Failed to enqueue AI budget finalize retry after create failure",
            enqueueError,
            {
              teamId: teamContext.teamId,
              userId: user.id,
              model,
              claimId: budgetClaim.claimId,
            },
          );
        }
      }
    }

    const openAiError = mapOpenAiError(error);
    logger.error("Failed to create AI chat completion stream", error, {
      teamId: teamContext.teamId,
      userId: user.id,
      model,
      openaiStatus: (error as { status?: number } | null)?.status,
      openaiCode: (error as { code?: string } | null)?.code,
      openaiType: (error as { type?: string } | null)?.type,
    });
    logAuditEvent({
      action: "ai.chat.request",
      outcome: "failure",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: {
        planKey: effectivePlanKey,
        accessMode: aiAccessMode,
        model,
        reason: openAiError.auditReason,
      },
    });
    return NextResponse.json(
      { error: AI_UNAVAILABLE_MESSAGE },
      { status: AI_UNAVAILABLE_STATUS },
    );
  }
}
