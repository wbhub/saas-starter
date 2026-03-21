import { NextResponse } from "next/server";
import {
  streamText,
  type AssistantModelMessage,
  type ModelMessage,
  type UserContent,
  type UserModelMessage,
} from "ai";
import {
  enqueueAiBudgetFinalizeRetry,
  maybeProcessAiBudgetFinalizeRetries,
} from "@/lib/ai/budget-finalize-retries";
import {
  getAiAccessMode,
  getAiAllowedSubscriptionStatuses,
} from "@/lib/ai/config";
import { type AiModality } from "@/lib/ai/config";
import { logAuditEvent } from "@/lib/audit";
import { resolveEffectivePlanKey } from "@/lib/billing/effective-plan";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { resolveActualTokenUsage } from "@/lib/ai/usage";
import { resolveAiAccess } from "@/lib/ai/access";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { logger } from "@/lib/logger";
import { isOpenAiConfigured, openai } from "@/lib/openai/client";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { LIVE_SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "@/lib/stripe/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCachedTeamContextForUser } from "@/lib/team-context-cache";

const AI_COMPLETION_MAX_TOKENS = 4_096;
const AI_UNAVAILABLE_STATUS = 503;
const MAX_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_ATTACHMENTS_PER_REQUEST = 16;
const MULTIMODAL_MODEL_PREFIXES = ["gpt-4.1", "gpt-5"] as const;
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
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
    url: z.string().trim().url().refine((value) => isHttpsUrl(value), "Attachment URL must use https.").optional(),
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

type BudgetClaim = {
  claimId: string;
  monthStart: string;
};

type OpenAiErrorInfo = {
  auditReason: string;
};

type ChatMessage = z.infer<typeof messageSchema>;
type ChatAttachment = z.infer<typeof attachmentSchema>;

type AttachmentValidationFailure = {
  reason: "unsupported_file_type";
  fileType: "image" | "file";
  mimeType: string;
};

type AttachmentCounts = {
  image: number;
  file: number;
  total: number;
};

function estimatePromptTokens(messages: ChatMessage[]) {
  const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  const textEstimate = Math.ceil(totalChars / 3) + messages.length * 8;
  const attachmentEstimate = messages.reduce((sum, message) => {
    const attachments = message.attachments ?? [];
    return (
      sum +
      attachments.reduce((attachmentSum, attachment) => {
        if (attachment.type === "image") {
          return attachmentSum + estimateImagePromptTokens(attachment);
        }
        if (attachment.data) {
          return attachmentSum + Math.ceil(attachment.data.length / 3);
        }
        return attachmentSum + 600;
      }, 0)
    );
  }, 0);
  return textEstimate + attachmentEstimate;
}

function estimateImagePromptTokens(attachment: ChatAttachment) {
  if (attachment.data) {
    const base64Payload = attachment.data.startsWith("data:")
      ? (attachment.data.split(",", 2)[1] ?? "")
      : attachment.data;
    const approxBytes = Math.ceil((base64Payload.length * 3) / 4);
    const estimateFromBytes = Math.ceil(approxBytes / 4);
    return Math.min(Math.max(estimateFromBytes, 400), 3_200);
  }
  if (attachment.fileId) {
    return 1_000;
  }
  return 900;
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

function modelSupportsModalities(model: string, modalities: AiModality[]) {
  const requiresMultimodal = modalities.includes("image") || modalities.includes("file");
  if (!requiresMultimodal) {
    return true;
  }
  const normalizedModel = model.toLowerCase();
  return MULTIMODAL_MODEL_PREFIXES.some((prefix) => normalizedModel.startsWith(prefix));
}

function validateAttachmentTypes(messages: ChatMessage[]): AttachmentValidationFailure | null {
  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
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
    const providerOptions = attachment.fileId
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
  const t = await getRouteTranslator("ApiAiChat", request);
  const aiUnavailableMessage = t("errors.unavailable");

  const csrfError = verifyCsrfProtection(request, {
    invalidOrigin: t("errors.invalidOrigin"),
    missingToken: t("errors.missingCsrfToken"),
    invalidToken: t("errors.invalidCsrfToken"),
  });
  if (csrfError) {
    return csrfError;
  }

  const contentTypeError = requireJsonContentType(request, {
    errorMessage: t("errors.invalidContentType"),
  });
  if (contentTypeError) {
    return contentTypeError;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: t("errors.unauthorized") }, { status: 401 });
  }

  const teamContext = await getCachedTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return NextResponse.json(
      { error: t("errors.noTeamMembership") },
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
      { error: t("errors.rateLimited") },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      },
    );
  }

  const bodyParse = await parseJsonWithSchema(request, chatPayloadSchema);
  if (!bodyParse.success) {
    if (bodyParse.tooLarge) {
      return NextResponse.json({ error: t("errors.payloadTooLarge") }, { status: 413 });
    }
    return NextResponse.json({ error: t("errors.invalidPayload") }, { status: 400 });
  }
  const requestModalities = getRequestModalities(bodyParse.data.messages);
  const attachmentCounts = getAttachmentCounts(bodyParse.data.messages);
  if (attachmentCounts.total > MAX_ATTACHMENTS_PER_REQUEST) {
    return NextResponse.json(
      {
        error: t("errors.maxAttachments", { max: MAX_ATTACHMENTS_PER_REQUEST }),
      },
      { status: 400 },
    );
  }
  const unsupportedAttachment = validateAttachmentTypes(bodyParse.data.messages);
  if (unsupportedAttachment) {
    return NextResponse.json(
      {
        error: t("errors.unsupportedAttachmentType"),
        details: {
          fileType: unsupportedAttachment.fileType,
          mimeType: unsupportedAttachment.mimeType,
        },
      },
      { status: 400 },
    );
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
      return NextResponse.json(
        { error: aiUnavailableMessage },
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
        { error: aiUnavailableMessage },
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
        requestModalities,
        attachmentCounts,
      },
    });
    return NextResponse.json(
      {
        error: aiUnavailableMessage,
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
        requestModalities,
        attachmentCounts,
      },
    });
    return NextResponse.json(
      { error: aiUnavailableMessage },
      { status: AI_UNAVAILABLE_STATUS },
    );
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
    return NextResponse.json(
      { error: aiUnavailableMessage },
      { status: AI_UNAVAILABLE_STATUS },
    );
  }
  if (!modelSupportsModalities(model, requestModalities)) {
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
    return NextResponse.json(
      { error: aiUnavailableMessage },
      { status: AI_UNAVAILABLE_STATUS },
    );
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
      return NextResponse.json(
        { error: aiUnavailableMessage },
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
          requestModalities,
          attachmentCounts,
        },
      });
      return NextResponse.json(
        { error: aiUnavailableMessage },
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

    const aiResult = streamText({
      model: openai(model),
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
        requestModalities,
        attachmentCounts,
      },
    });
    return NextResponse.json(
      { error: aiUnavailableMessage },
      { status: AI_UNAVAILABLE_STATUS },
    );
  }
}
