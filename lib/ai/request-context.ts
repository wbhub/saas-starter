import "server-only";
import { type LanguageModel } from "ai";
import { type AiAccessMode, type AiModality, getAiAccessMode, getAiAllowedSubscriptionStatuses } from "@/lib/ai/config";
import {
  claimTeamAiBudget,
  finalizeTeamAiBudgetClaimWithRetry,
  type BudgetClaim,
} from "@/lib/ai/chat-budget";
import { maybeProcessAiBudgetFinalizeRetries } from "@/lib/ai/budget-finalize-retries";
import { resolveAiAccess } from "@/lib/ai/access";
import {
  aiProviderName,
  getAiLanguageModel,
  isAiProviderConfigured,
  providerSupportsModalities,
} from "@/lib/ai/provider";
import { type EffectivePlanKey, resolveEffectivePlanKey } from "@/lib/billing/effective-plan";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { jsonError } from "@/lib/http/api-json";
import { requireJsonContentType } from "@/lib/http/content-type";
import { getOrCreateRequestId, withRequestId } from "@/lib/http/request-id";
import { parseJsonWithSchema, type z } from "@/lib/http/request-validation";
import type { ZodType } from "zod";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { LIVE_SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "@/lib/stripe/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCachedTeamContextForUser } from "@/lib/team-context-cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttachmentCounts = {
  image: number;
  file: number;
  total: number;
};

const EMPTY_ATTACHMENT_COUNTS: AttachmentCounts = { image: 0, file: 0, total: 0 };

export type AiRequestContextConfig<TSchema extends ZodType> = {
  /** i18n namespace for route-specific error messages (e.g. "ApiAiChat"). */
  i18nNamespace: string;

  /** Zod schema used to parse the JSON request body. */
  bodySchema: TSchema;

  /** Rate-limit key names used for the per-user and per-team checks. */
  rateLimitKeys: {
    user: keyof typeof RATE_LIMITS;
    team: keyof typeof RATE_LIMITS;
    /** Prefix used for rate-limit storage keys (e.g. "ai-chat" or "ai-object"). */
    prefix: string;
  };

  /** Audit action string (e.g. "ai.chat.request" or "ai.object.request"). */
  auditAction: string;

  /**
   * Extract the modalities the request requires. Defaults to `["text"]` when
   * omitted.
   */
  getRequestModalities?: (body: z.infer<TSchema>) => AiModality[];

  /**
   * Extract attachment counts from the parsed body. Defaults to zero counts
   * when omitted.
   */
  getAttachmentCounts?: (body: z.infer<TSchema>) => AttachmentCounts;

  /**
   * Estimate prompt tokens from the parsed body. Used for budget claiming.
   */
  estimatePromptTokens: (body: z.infer<TSchema>) => number;

  /** Maximum tokens the model is allowed to generate per step. */
  maxCompletionTokens: number;

  /**
   * When `true`, skip loading the tools module and force `maxSteps` to 1.
   * Use this for routes (like `/api/ai/object`) that never invoke tools.
   * Defaults to `false`.
   */
  skipTools?: boolean;
};

export type AiRequestContext<TBody> = {
  requestId: string;
  user: { id: string };
  teamContext: { teamId: string };
  body: TBody;
  model: string;
  languageModel: LanguageModel;
  effectivePlanKey: EffectivePlanKey | null;
  aiAccessMode: AiAccessMode;
  budgetClaim: BudgetClaim | null;
  monthlyTokenBudget: number;
  projectedRequestTokens: number;
  estimatedPromptTokens: number;
  toolsEnabled: boolean;
  maxSteps: number;
  requestModalities: AiModality[];
  attachmentCounts: AttachmentCounts;
  /** Route-scoped translator for the configured i18n namespace. */
  t: (key: string, values?: Record<string, string | number>) => string;
};

export type AiRequestContextResult<TBody> =
  | { ok: true; ctx: AiRequestContext<TBody> }
  | { ok: false; response: Response };

// ---------------------------------------------------------------------------
// Constants shared with routes
// ---------------------------------------------------------------------------

const AI_UNAVAILABLE_STATUS = 503;
const AI_FORBIDDEN_STATUS = 403;
const AI_PAYMENT_REQUIRED_STATUS = 402;

// ---------------------------------------------------------------------------
// resolveAiRequestContext
// ---------------------------------------------------------------------------

export async function resolveAiRequestContext<TSchema extends ZodType>(
  request: Request,
  config: AiRequestContextConfig<TSchema>,
): Promise<AiRequestContextResult<z.infer<TSchema>>> {
  const t = await getRouteTranslator(config.i18nNamespace, request);
  const requestId = getOrCreateRequestId(request);

  const err = (
    error: string,
    status: number,
    init?: ResponseInit & { code?: string; data?: Record<string, unknown> },
  ) => withRequestId(jsonError(error, status, init), requestId);

  // ── Cached translated error messages ──
  const aiUnavailableMessage = t("errors.unavailable");
  const planRequiredMessage = t("errors.planRequired");
  const budgetExceededMessage = t("errors.budgetExceeded");

  // ── CSRF ──
  const csrfError = verifyCsrfProtection(request, {
    invalidOrigin: t("errors.invalidOrigin"),
    missingToken: t("errors.missingCsrfToken"),
    invalidToken: t("errors.invalidCsrfToken"),
  });
  if (csrfError) {
    return { ok: false, response: withRequestId(csrfError, requestId) };
  }

  // ── Content-Type ──
  const contentTypeError = requireJsonContentType(request, {
    errorMessage: t("errors.invalidContentType"),
  });
  if (contentTypeError) {
    return { ok: false, response: withRequestId(contentTypeError, requestId) };
  }

  // ── Auth ──
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: err(t("errors.unauthorized"), 401) };
  }

  // ── Team context ──
  const teamContext = await getCachedTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return { ok: false, response: err(t("errors.noTeamMembership"), 403) };
  }

  // ── Rate limiting ──
  const [userRateLimit, teamRateLimit] = await Promise.all([
    checkRateLimit({
      key: `${config.rateLimitKeys.prefix}:user:${user.id}`,
      ...RATE_LIMITS[config.rateLimitKeys.user],
    }),
    checkRateLimit({
      key: `${config.rateLimitKeys.prefix}:team:${teamContext.teamId}`,
      ...RATE_LIMITS[config.rateLimitKeys.team],
    }),
  ]);
  if (!userRateLimit.allowed || !teamRateLimit.allowed) {
    const retryAfterSeconds = Math.max(
      userRateLimit.retryAfterSeconds,
      teamRateLimit.retryAfterSeconds,
    );
    return {
      ok: false,
      response: err(t("errors.rateLimited"), 429, {
        headers: { "Retry-After": String(retryAfterSeconds) },
      }),
    };
  }

  // ── Body parsing ──
  const bodyParse = await parseJsonWithSchema(request, config.bodySchema);
  if (!bodyParse.success) {
    if (bodyParse.tooLarge) {
      return { ok: false, response: err(t("errors.payloadTooLarge"), 413) };
    }
    return { ok: false, response: err(t("errors.invalidPayload"), 400) };
  }
  const body = bodyParse.data as z.infer<TSchema>;

  const requestModalities = config.getRequestModalities
    ? config.getRequestModalities(body)
    : (["text"] as AiModality[]);

  const attachmentCounts = config.getAttachmentCounts
    ? config.getAttachmentCounts(body)
    : EMPTY_ATTACHMENT_COUNTS;

  // ── AI access mode ──
  const aiAccessMode = getAiAccessMode();

  if (aiAccessMode === "paid") {
    const allowedStatuses = getAiAllowedSubscriptionStatuses();
    if (!allowedStatuses.length) {
      logAuditEvent({
        action: config.auditAction,
        outcome: "denied",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        metadata: {
          reason: "ai_statuses_not_configured",
          accessMode: aiAccessMode,
          requestModalities,
          attachmentCounts,
        },
      });
      return {
        ok: false,
        response: err(planRequiredMessage, AI_FORBIDDEN_STATUS, { code: "plan_required" }),
      };
    }
  }

  // ── Subscription lookup ──
  let subscriptionRow: {
    stripe_price_id: string | null;
    status: SubscriptionStatus | null;
  } | null = null;

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
      logger.error("Failed to load subscription for AI request", subscriptionError, {
        teamId: teamContext.teamId,
        userId: user.id,
        accessMode: aiAccessMode,
      });
      return {
        ok: false,
        response: err(aiUnavailableMessage, AI_UNAVAILABLE_STATUS, { code: "upstream_error" }),
      };
    }

    subscriptionRow = data;
  }

  // ── Access resolution ──
  const effectivePlanKey = resolveEffectivePlanKey(subscriptionRow);
  const aiAccess = resolveAiAccess({ effectivePlanKey });

  if (!aiAccess.allowed || !aiAccess.model) {
    logAuditEvent({
      action: config.auditAction,
      outcome: "denied",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: {
        reason: aiAccess.denialReason ?? "plan_not_allowed",
        accessMode: aiAccessMode,
        effectivePlanKey,
        stripePriceId: subscriptionRow?.stripe_price_id ?? null,
        requestModalities,
        attachmentCounts,
      },
    });
    return {
      ok: false,
      response: err(planRequiredMessage, AI_FORBIDDEN_STATUS, { code: "plan_required" }),
    };
  }

  // ── Provider configured? ──
  if (!isAiProviderConfigured) {
    logAuditEvent({
      action: config.auditAction,
      outcome: "denied",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: {
        reason: "ai_provider_not_configured",
        planKey: effectivePlanKey,
        accessMode: aiAccessMode,
        model: aiAccess.model,
        provider: aiProviderName,
        requestModalities,
        attachmentCounts,
      },
    });
    return {
      ok: false,
      response: err(aiUnavailableMessage, AI_UNAVAILABLE_STATUS, { code: "upstream_error" }),
    };
  }

  const model = aiAccess.model;

  // ── Modality validation ──
  const disallowedModality = requestModalities.find(
    (modality) => !aiAccess.allowedModalities.includes(modality),
  );
  if (disallowedModality) {
    logAuditEvent({
      action: config.auditAction,
      outcome: "denied",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: {
        reason: "modality_not_allowed",
        planKey: effectivePlanKey,
        accessMode: aiAccessMode,
        model,
        requestModalities,
        allowedModalities: aiAccess.allowedModalities,
        blockedModality: disallowedModality,
        attachmentCounts,
      },
    });
    return {
      ok: false,
      response: err(t("errors.modalityNotAllowed"), AI_FORBIDDEN_STATUS, {
        code: "modality_not_allowed",
      }),
    };
  }

  if (!providerSupportsModalities(model, requestModalities)) {
    logAuditEvent({
      action: config.auditAction,
      outcome: "denied",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: {
        reason: "model_modality_mismatch",
        planKey: effectivePlanKey,
        accessMode: aiAccessMode,
        model,
        requestModalities,
        attachmentCounts,
      },
    });
    return {
      ok: false,
      response: err(t("errors.modalityNotAllowed"), AI_FORBIDDEN_STATUS, {
        code: "modality_not_allowed",
      }),
    };
  }

  // ── Tools & steps ──
  let toolsEnabled = false;
  let maxSteps = 1;
  if (!config.skipTools) {
    // Imported lazily to avoid circular dependencies in routes that don't need tools.
    const { getAiToolsEnabled } = await import("@/lib/ai/config");
    const { AI_TOOL_MAP } = await import("@/lib/ai/tools");
    toolsEnabled = getAiToolsEnabled() && Object.keys(AI_TOOL_MAP).length > 0;
    maxSteps = toolsEnabled ? aiAccess.maxSteps : 1;
  }

  // ── Budget ──
  const monthlyTokenBudget = aiAccess.monthlyTokenBudget;
  const estimatedPromptTokens = config.estimatePromptTokens(body);
  const singleStepTokens = estimatedPromptTokens + config.maxCompletionTokens;
  const projectedRequestTokens = singleStepTokens * maxSteps;

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
      return {
        ok: false,
        response: err(aiUnavailableMessage, AI_UNAVAILABLE_STATUS, { code: "upstream_error" }),
      };
    }

    if (!budgetClaim) {
      logAuditEvent({
        action: config.auditAction,
        outcome: "denied",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        metadata: {
          reason: "team_token_budget_exceeded",
          planKey: effectivePlanKey,
          accessMode: aiAccessMode,
          monthlyTokenBudget,
          projectedRequestTokens,
          requestModalities,
          attachmentCounts,
        },
      });
      return {
        ok: false,
        response: err(budgetExceededMessage, AI_PAYMENT_REQUIRED_STATUS, {
          code: "budget_exceeded",
        }),
      };
    }
  }

  // Best-effort queue healing so finalize retries do not depend solely on cron.
  if (budgetClaim) {
    void maybeProcessAiBudgetFinalizeRetries();
  }

  // ── Language model ──
  const languageModel = await getAiLanguageModel(model);
  if (!languageModel) {
    if (budgetClaim) {
      try {
        await finalizeTeamAiBudgetClaimWithRetry({
          claimId: budgetClaim.claimId,
          actualTokens: 0,
          context: { teamId: teamContext.teamId, userId: user.id, model },
          onFinalizeFailureMessage:
            "Failed to release AI budget claim after language model resolution failure",
          onEnqueueFailureMessage:
            "Failed to enqueue AI budget finalize retry after language model resolution failure",
        });
      } catch (finalizeError) {
        logger.error(
          "Failed to release AI budget claim after language model resolution failure",
          finalizeError,
          { teamId: teamContext.teamId, userId: user.id, model, claimId: budgetClaim.claimId },
        );
      }
    }
    logAuditEvent({
      action: config.auditAction,
      outcome: "denied",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: {
        reason: "language_model_unavailable",
        planKey: effectivePlanKey,
        accessMode: aiAccessMode,
        model,
        provider: aiProviderName,
        requestModalities,
        attachmentCounts,
      },
    });
    return {
      ok: false,
      response: withRequestId(
        jsonError(aiUnavailableMessage, AI_UNAVAILABLE_STATUS, { code: "upstream_error" }),
        requestId,
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      requestId,
      user,
      teamContext,
      body,
      model,
      languageModel,
      effectivePlanKey,
      aiAccessMode,
      budgetClaim,
      monthlyTokenBudget,
      projectedRequestTokens,
      estimatedPromptTokens,
      toolsEnabled,
      maxSteps,
      requestModalities,
      attachmentCounts,
      t,
    },
  };
}

// ---------------------------------------------------------------------------
// Shared helpers for route finalization (used by both chat and object routes)
// ---------------------------------------------------------------------------

export type UpstreamErrorInfo = {
  auditReason: string;
  code: "upstream_rate_limited" | "upstream_bad_request" | "upstream_error";
  status: number;
};

export function mapUpstreamError(error: unknown): UpstreamErrorInfo {
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
      auditReason: "provider_rate_limited",
      code: "upstream_rate_limited",
      status: 429,
    };
  }

  if (status === 400 || status === 422) {
    return {
      auditReason: "provider_bad_request",
      code: "upstream_bad_request",
      status: 400,
    };
  }

  if (status === 408 || status === 504 || name === "APIConnectionTimeoutError") {
    return {
      auditReason: "provider_timeout",
      code: "upstream_error",
      status: 503,
    };
  }

  if (status !== undefined && status >= 500) {
    return {
      auditReason: "provider_upstream_error",
      code: "upstream_error",
      status: 503,
    };
  }

  return {
    auditReason: "provider_create_failed",
    code: "upstream_error",
    status: 503,
  };
}

export function aiErrorResponse({
  error,
  code,
  status,
  requestId,
}: {
  error: string;
  code: string;
  status: number;
  requestId: string;
}) {
  return withRequestId(jsonError(error, status, { code }), requestId);
}

export async function insertAiUsageRow({
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
