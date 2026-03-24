import {
  streamText,
  type AssistantModelMessage,
  type ModelMessage,
  type UserContent,
  type UserModelMessage,
} from "ai";
import { maybeProcessAiBudgetFinalizeRetries } from "@/lib/ai/budget-finalize-retries";
import { jsonError } from "@/lib/http/api-json";
import { getOrCreateRequestId, withRequestId } from "@/lib/http/request-id";
import {
  claimTeamAiBudget,
  finalizeTeamAiBudgetClaimWithRetry,
  type BudgetClaim,
} from "@/lib/ai/chat-budget";
import { getAiAccessMode, getAiAllowedSubscriptionStatuses } from "@/lib/ai/config";
import { type AiModality } from "@/lib/ai/config";
import { estimatePromptTokens } from "@/lib/ai/token-estimation";
import { logAuditEvent } from "@/lib/audit";
import { resolveEffectivePlanKey } from "@/lib/billing/effective-plan";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { resolveActualTokenUsage } from "@/lib/ai/usage";
import { resolveAiAccess } from "@/lib/ai/access";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { logger } from "@/lib/logger";
import {
  aiProviderName,
  getAiLanguageModel,
  isAiProviderConfigured,
  providerSupportsModalities,
  supportsOpenAiFileIds,
} from "@/lib/ai/provider";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { LIVE_SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "@/lib/stripe/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCachedTeamContextForUser } from "@/lib/team-context-cache";

const AI_COMPLETION_MAX_TOKENS = 4_096;
const AI_UNAVAILABLE_STATUS = 503;
const AI_FORBIDDEN_STATUS = 403;
const AI_PAYMENT_REQUIRED_STATUS = 402;
const MAX_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_ATTACHMENTS_PER_REQUEST = 16;
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const SUPPORTED_FILE_MIME_TYPES = new Set(["application/pdf", "text/plain", "text/csv"]);

function isHttpsUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const attachmentSchema = z
  .object({
    type: z.enum(["image", "file"]),
    mimeType: z.string().trim().toLowerCase().min(1).max(255),
    name: z.string().trim().min(1).max(255).optional(),
    url: z
      .string()
      .trim()
      .url()
      .refine((value) => isHttpsUrl(value), "Attachment URL must use https.")
      .optional(),
    data: z.string().trim().min(1).max(300_000).optional(),
    fileId: z.string().trim().min(1).max(255).optional(),
  })
  .superRefine((attachment, context) => {
    const sourceCount = [attachment.url, attachment.data, attachment.fileId].filter(Boolean).length;
    if (sourceCount !== 1) {
      context.addIssue({
        code: "custom",
        message: "Attachment must provide exactly one source field (url, data, or fileId).",
      });
    }
  });

type ChatAttachment = z.infer<typeof attachmentSchema>;

const userMessageSchema = z.object({
  role: z.literal("user"),
  content: z.string().trim().min(1).max(8_000),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
});
const assistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.string().trim().min(1).max(8_000),
  attachments: z.never().optional(),
});
const messageSchema = z.discriminatedUnion("role", [userMessageSchema, assistantMessageSchema]);

const chatPayloadSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
});

type UsageTotals = {
  promptTokens: number;
  completionTokens: number;
};

type UpstreamErrorInfo = {
  auditReason: string;
  code: "upstream_rate_limited" | "upstream_bad_request" | "upstream_error";
  status: number;
};

type ChatMessage = z.infer<typeof messageSchema>;

type AttachmentValidationFailure = {
  reason: "unsupported_file_type" | "unsupported_attachment_source";
  fileType: "image" | "file";
  mimeType: string;
  source?: "fileId";
};

type AttachmentCounts = {
  image: number;
  file: number;
  total: number;
};

function aiErrorResponse({
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

function getRequestModalities(messages: ChatMessage[]): AiModality[] {
  const modalities = new Set<AiModality>(["text"]);
  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
      modalities.add(attachment.type);
    }
  }
  return (["text", "image", "file"] as const).filter((modality) => modalities.has(modality));
}

function getAttachmentCounts(messages: ChatMessage[]): AttachmentCounts {
  const counts: AttachmentCounts = { image: 0, file: 0, total: 0 };
  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
      counts[attachment.type] += 1;
      counts.total += 1;
    }
  }
  return counts;
}

function validateAttachmentTypes(messages: ChatMessage[]): AttachmentValidationFailure | null {
  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
      if (attachment.fileId && !supportsOpenAiFileIds) {
        return {
          reason: "unsupported_attachment_source",
          fileType: attachment.type,
          mimeType: attachment.mimeType,
          source: "fileId",
        };
      }
      if (attachment.type === "image" && !SUPPORTED_IMAGE_MIME_TYPES.has(attachment.mimeType)) {
        return {
          reason: "unsupported_file_type",
          fileType: "image",
          mimeType: attachment.mimeType,
        };
      }
      if (attachment.type === "file" && !SUPPORTED_FILE_MIME_TYPES.has(attachment.mimeType)) {
        return {
          reason: "unsupported_file_type",
          fileType: "file",
          mimeType: attachment.mimeType,
        };
      }
    }
  }
  return null;
}

function toAttachmentData(attachment: ChatAttachment) {
  if (attachment.url) {
    return attachment.url;
  }
  if (attachment.data) {
    return attachment.data.startsWith("data:")
      ? attachment.data
      : `data:${attachment.mimeType};base64,${attachment.data}`;
  }
  return attachment.fileId ?? "";
}

function toUserMessageContent(message: ChatMessage): UserContent {
  const attachments = message.attachments ?? [];
  if (!attachments.length) {
    return message.content;
  }

  const content: Array<Record<string, unknown>> = [{ type: "text", text: message.content }];
  for (const attachment of attachments) {
    const providerOptions =
      attachment.fileId && supportsOpenAiFileIds
        ? {
            openai: {
              fileId: attachment.fileId,
            },
          }
        : undefined;

    if (attachment.type === "image") {
      content.push({
        type: "image",
        image: toAttachmentData(attachment),
        ...(providerOptions ? { providerOptions } : {}),
      });
      continue;
    }

    content.push({
      type: "file",
      data: toAttachmentData(attachment),
      mediaType: attachment.mimeType,
      filename: attachment.name ?? "attachment",
      ...(providerOptions ? { providerOptions } : {}),
    });
  }

  return content as unknown as UserContent;
}

function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((message): UserModelMessage | AssistantModelMessage => {
    if (message.role === "assistant") {
      return { role: "assistant", content: message.content };
    }

    return {
      role: "user",
      content: toUserMessageContent(message),
    };
  });
}

function mapUpstreamError(error: unknown): UpstreamErrorInfo {
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
      status: AI_UNAVAILABLE_STATUS,
    };
  }

  if (status !== undefined && status >= 500) {
    return {
      auditReason: "provider_upstream_error",
      code: "upstream_error",
      status: AI_UNAVAILABLE_STATUS,
    };
  }

  return {
    auditReason: "provider_create_failed",
    code: "upstream_error",
    status: AI_UNAVAILABLE_STATUS,
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
  const t = await getRouteTranslator("ApiAiChat", request);
  const requestId = getOrCreateRequestId(request);
  const err = (
    error: string,
    status: number,
    init?: ResponseInit & { code?: string; data?: Record<string, unknown> },
  ) => withRequestId(jsonError(error, status, init), requestId);
  const aiUnavailableMessage = t("errors.unavailable");
  const planRequiredMessage = t("errors.planRequired");
  const budgetExceededMessage = t("errors.budgetExceeded");
  const modalityNotAllowedMessage = t("errors.modalityNotAllowed");
  const upstreamRateLimitedMessage = t("errors.upstreamRateLimited");
  const upstreamBadRequestMessage = t("errors.upstreamBadRequest");

  const csrfError = verifyCsrfProtection(request, {
    invalidOrigin: t("errors.invalidOrigin"),
    missingToken: t("errors.missingCsrfToken"),
    invalidToken: t("errors.invalidCsrfToken"),
  });
  if (csrfError) {
    return withRequestId(csrfError, requestId);
  }

  const contentTypeError = requireJsonContentType(request, {
    errorMessage: t("errors.invalidContentType"),
  });
  if (contentTypeError) {
    return withRequestId(contentTypeError, requestId);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return err(t("errors.unauthorized"), 401);
  }

  const teamContext = await getCachedTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return err(t("errors.noTeamMembership"), 403);
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
    return err(t("errors.rateLimited"), 429, {
      headers: { "Retry-After": String(retryAfterSeconds) },
    });
  }

  const bodyParse = await parseJsonWithSchema(request, chatPayloadSchema);
  if (!bodyParse.success) {
    if (bodyParse.tooLarge) {
      return err(t("errors.payloadTooLarge"), 413);
    }
    return err(t("errors.invalidPayload"), 400);
  }
  const requestModalities = getRequestModalities(bodyParse.data.messages);
  const attachmentCounts = getAttachmentCounts(bodyParse.data.messages);
  if (attachmentCounts.total > MAX_ATTACHMENTS_PER_REQUEST) {
    return err(t("errors.maxAttachments", { max: MAX_ATTACHMENTS_PER_REQUEST }), 400);
  }
  const unsupportedAttachment = validateAttachmentTypes(bodyParse.data.messages);
  if (unsupportedAttachment) {
    if (unsupportedAttachment.reason === "unsupported_attachment_source") {
      return err(t("errors.invalidPayload"), 400);
    }
    return err(t("errors.unsupportedAttachmentType"), 400, {
      data: {
        details: {
          fileType: unsupportedAttachment.fileType,
          mimeType: unsupportedAttachment.mimeType,
        },
      },
    });
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
        metadata: {
          reason: "ai_statuses_not_configured",
          accessMode: aiAccessMode,
          requestModalities,
          attachmentCounts,
        },
      });
      return err(planRequiredMessage, AI_FORBIDDEN_STATUS, { code: "plan_required" });
    }
  }

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
      logger.error("Failed to load subscription for AI chat request", subscriptionError, {
        teamId: teamContext.teamId,
        userId: user.id,
        accessMode: aiAccessMode,
      });
      return err(aiUnavailableMessage, AI_UNAVAILABLE_STATUS, { code: "upstream_error" });
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
        requestModalities,
        attachmentCounts,
      },
    });
    return err(planRequiredMessage, AI_FORBIDDEN_STATUS, { code: "plan_required" });
  }

  if (!isAiProviderConfigured) {
    logAuditEvent({
      action: "ai.chat.request",
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
    return err(aiUnavailableMessage, AI_UNAVAILABLE_STATUS, { code: "upstream_error" });
  }

  const model = aiAccess.model;
  const disallowedModality = requestModalities.find(
    (modality) => !aiAccess.allowedModalities.includes(modality),
  );
  if (disallowedModality) {
    logAuditEvent({
      action: "ai.chat.request",
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
    return err(modalityNotAllowedMessage, AI_FORBIDDEN_STATUS, { code: "modality_not_allowed" });
  }
  if (!providerSupportsModalities(model, requestModalities)) {
    logAuditEvent({
      action: "ai.chat.request",
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
    return err(modalityNotAllowedMessage, AI_FORBIDDEN_STATUS, { code: "modality_not_allowed" });
  }
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
      return err(aiUnavailableMessage, AI_UNAVAILABLE_STATUS, { code: "upstream_error" });
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
          requestModalities,
          attachmentCounts,
        },
      });
      return err(budgetExceededMessage, AI_PAYMENT_REQUIRED_STATUS, { code: "budget_exceeded" });
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

    const languageModel = getAiLanguageModel(model);
    if (!languageModel) {
      return aiErrorResponse({
        error: aiUnavailableMessage,
        code: "upstream_error",
        status: AI_UNAVAILABLE_STATUS,
        requestId,
      });
    }
    const aiResult = streamText({
      model: languageModel,
      messages: toModelMessages(bodyParse.data.messages),
      abortSignal: upstreamAbortController.signal,
      maxOutputTokens: AI_COMPLETION_MAX_TOKENS,
    });

    const encoder = new TextEncoder();
    const usage: UsageTotals = { promptTokens: 0, completionTokens: 0 };
    let streamedCompletionChars = 0;

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        let streamError: unknown | null = null;

        try {
          for await (const part of aiResult.fullStream) {
            if (part.type === "text-delta") {
              controller.enqueue(encoder.encode(part.text));
              streamedCompletionChars += part.text.length;
              continue;
            }
            if (part.type === "finish") {
              usage.promptTokens = part.totalUsage.inputTokens ?? usage.promptTokens;
              usage.completionTokens = part.totalUsage.outputTokens ?? usage.completionTokens;
            }
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
            await finalizeTeamAiBudgetClaimWithRetry({
              claimId: budgetClaim.claimId,
              actualTokens: resolvedUsage.actualTokens,
              context: {
                teamId: teamContext.teamId,
                userId: user.id,
                model,
              },
              onFinalizeFailureMessage: "Failed to finalize AI budget claim",
              onEnqueueFailureMessage:
                "Failed to enqueue AI budget finalize retry after stream finalization error",
            });
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
                requestModalities,
                attachmentCounts,
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
              requestModalities,
              attachmentCounts,
            },
          });
        }
      },
      cancel() {
        upstreamAbortController.abort("downstream_cancelled");
      },
    });

    return withRequestId(
      new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }),
      requestId,
    );
  } catch (error) {
    if (budgetClaim) {
      await finalizeTeamAiBudgetClaimWithRetry({
        claimId: budgetClaim.claimId,
        actualTokens: 0,
        context: {
          teamId: teamContext.teamId,
          userId: user.id,
          model,
        },
        onFinalizeFailureMessage: "Failed to release AI budget claim after create failure",
        onEnqueueFailureMessage: "Failed to enqueue AI budget finalize retry after create failure",
      });
    }

    const upstreamError = mapUpstreamError(error);
    logger.error("Failed to create AI chat completion stream", error, {
      teamId: teamContext.teamId,
      userId: user.id,
      model,
      aiProvider: aiProviderName,
      providerStatus: (error as { status?: number } | null)?.status,
      providerCode: (error as { code?: string } | null)?.code,
      providerType: (error as { type?: string } | null)?.type,
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
        reason: upstreamError.auditReason,
        requestModalities,
        attachmentCounts,
      },
    });
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
