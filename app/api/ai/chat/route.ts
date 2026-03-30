import {
  consumeStream,
  stepCountIs,
  streamText,
  type AssistantModelMessage,
  type ModelMessage,
  type UserContent,
  type UserModelMessage,
} from "ai";
import { jsonError } from "@/lib/http/api-json";
import { withRequestId } from "@/lib/http/request-id";
import { finalizeTeamAiBudgetClaimWithRetry } from "@/lib/ai/chat-budget";
import { AI_TOOL_MAP } from "@/lib/ai/tools";
import { type AiModality } from "@/lib/ai/config";
import { estimatePromptTokens } from "@/lib/ai/token-estimation";
import { logAuditEvent } from "@/lib/audit";
import { resolveActualTokenUsage } from "@/lib/ai/usage";
import { z } from "@/lib/http/request-validation";
import { logger } from "@/lib/logger";
import { createThread, saveThreadMessages, getThread } from "@/lib/ai/threads";
import { aiProviderName, supportsProviderFileIds } from "@/lib/ai/provider";
import {
  SUPPORTED_IMAGE_MIME_TYPES,
  isSupportedFileMimeType,
  toProviderFilePlaceholderUrl,
} from "@/lib/ai/attachments";
import {
  resolveAiRequestContext,
  mapUpstreamError,
  aiErrorResponse,
  insertAiUsageRow,
  recordAiUsageMonthlyTotals,
  type AttachmentCounts,
} from "@/lib/ai/request-context";

const AI_COMPLETION_MAX_TOKENS = 4_096;
const MAX_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_ATTACHMENTS_PER_REQUEST = 16;

// ---------------------------------------------------------------------------
// Chat-specific schemas and helpers
// ---------------------------------------------------------------------------

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

const userMessageSchema = z
  .object({
    role: z.literal("user"),
    content: z.string().trim().max(8_000),
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
  })
  .superRefine((message, context) => {
    if (message.content.length === 0 && (message.attachments?.length ?? 0) === 0) {
      context.addIssue({
        code: "custom",
        message: "User message must include content or attachments.",
      });
    }
  });
const assistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.string().trim().min(1).max(8_000),
  attachments: z.never().optional(),
});
const messageSchema = z.discriminatedUnion("role", [userMessageSchema, assistantMessageSchema]);

const chatPayloadSchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
  threadId: z.string().uuid().optional(),
});

type UsageTotals = {
  promptTokens: number;
  completionTokens: number;
};

type ChatMessage = z.infer<typeof messageSchema>;

type AttachmentValidationFailure = {
  reason: "unsupported_file_type" | "unsupported_attachment_source";
  fileType: "image" | "file";
  mimeType: string;
  source?: "fileId";
};

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
      if (attachment.fileId && !supportsProviderFileIds) {
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
      if (
        attachment.type === "file" &&
        !isSupportedFileMimeType(attachment.mimeType, aiProviderName)
      ) {
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

function toAttachmentUrl(attachment: ChatAttachment) {
  if (attachment.url) {
    return attachment.url;
  }
  if (attachment.data) {
    return attachment.data.startsWith("data:")
      ? attachment.data
      : `data:${attachment.mimeType};base64,${attachment.data}`;
  }
  if (attachment.fileId && supportsProviderFileIds) {
    return toProviderFilePlaceholderUrl("openai", attachment.fileId);
  }
  return "attachment://file";
}

function getUserMessageTitle(message: ChatMessage | undefined) {
  if (!message) {
    return undefined;
  }

  if (message.content.length > 0) {
    return message.content.slice(0, 100);
  }

  const firstAttachmentName = message.attachments?.[0]?.name?.trim();
  if (firstAttachmentName) {
    return firstAttachmentName.slice(0, 100);
  }

  return undefined;
}

function toPersistedUserMessageParts(message: ChatMessage) {
  const parts: Array<Record<string, unknown>> = [];

  if (message.content.length > 0) {
    parts.push({ type: "text", text: message.content });
  }

  for (const attachment of message.attachments ?? []) {
    const providerMetadata =
      attachment.fileId && supportsProviderFileIds
        ? aiProviderName === "anthropic"
          ? {
              anthropic: {
                fileId: attachment.fileId,
              },
            }
          : {
              openai: {
                fileId: attachment.fileId,
              },
            }
        : undefined;

    parts.push({
      type: "file",
      mediaType: attachment.mimeType,
      ...(attachment.name ? { filename: attachment.name } : {}),
      url: toAttachmentUrl(attachment),
      ...(providerMetadata ? { providerMetadata } : {}),
    });
  }

  return parts;
}

function toUserMessageContent(message: ChatMessage): UserContent {
  const attachments = message.attachments ?? [];
  if (!attachments.length) {
    return message.content;
  }

  const content: Array<Record<string, unknown>> = [];
  if (message.content.length > 0) {
    content.push({ type: "text", text: message.content });
  }

  for (const attachment of attachments) {
    content.push({
      type: "file",
      data:
        attachment.fileId && supportsProviderFileIds
          ? attachment.fileId
          : toAttachmentUrl(attachment),
      mediaType: attachment.mimeType,
      filename: attachment.name ?? "attachment",
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

function getAbortAuditReason(reason: unknown) {
  if (typeof reason === "string" && reason.trim().length > 0) {
    return reason;
  }
  return "stream_aborted";
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const result = await resolveAiRequestContext(request, {
    i18nNamespace: "ApiAiChat",
    bodySchema: chatPayloadSchema,
    rateLimitKeys: { user: "aiChatByUser", team: "aiChatByTeam", prefix: "ai-chat" },
    auditAction: "ai.chat.request",
    getRequestModalities: (body) => getRequestModalities(body.messages),
    getAttachmentCounts: (body) => getAttachmentCounts(body.messages),
    estimatePromptTokens: (body) => estimatePromptTokens(body.messages),
    maxCompletionTokens: AI_COMPLETION_MAX_TOKENS,
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
    languageModel,
    effectivePlanKey,
    aiAccessMode,
    budgetClaim,
    projectedRequestTokens,
    estimatedPromptTokens: estimatedTokens,
    toolsEnabled,
    maxSteps,
    requestModalities,
    attachmentCounts,
    t,
  } = result.ctx;

  // ── Chat-specific pre-flight: attachment validation ──
  if (attachmentCounts.total > MAX_ATTACHMENTS_PER_REQUEST) {
    return withRequestId(
      jsonError(t("errors.maxAttachments", { max: MAX_ATTACHMENTS_PER_REQUEST }), 400),
      requestId,
    );
  }
  const unsupportedAttachment = validateAttachmentTypes(body.messages);
  if (unsupportedAttachment) {
    if (unsupportedAttachment.reason === "unsupported_attachment_source") {
      return withRequestId(jsonError(t("errors.invalidPayload"), 400), requestId);
    }
    return withRequestId(
      jsonError(t("errors.unsupportedAttachmentType"), 400, {
        data: {
          details: {
            fileType: unsupportedAttachment.fileType,
            mimeType: unsupportedAttachment.mimeType,
          },
        },
      }),
      requestId,
    );
  }

  // ── Thread persistence setup ──
  let resolvedThreadId = body.threadId ?? null;
  if (resolvedThreadId) {
    const thread = await getThread({
      threadId: resolvedThreadId,
      teamId: teamContext.teamId,
      userId: user.id,
    });
    if (!thread) {
      return withRequestId(jsonError(t("errors.threadNotFound"), 404), requestId);
    }
  }

  const requestStartTime = Date.now();

  // ── Upstream error message helpers ──
  const aiUnavailableMessage = t("errors.unavailable");
  const upstreamRateLimitedMessage = t("errors.upstreamRateLimited");
  const upstreamBadRequestMessage = t("errors.upstreamBadRequest");

  try {
    const upstreamAbortController = new AbortController();
    request.signal.addEventListener(
      "abort",
      () => {
        upstreamAbortController.abort("client_disconnected");
      },
      { once: true },
    );

    if (toolsEnabled) {
      // ── Agent path: tools + multi-step + UI message stream ──
      const resolvedTeamId = teamContext.teamId;
      const resolvedUserId = user.id;
      const accumulatedUsage: UsageTotals = { promptTokens: 0, completionTokens: 0 };
      const toolCallNames: string[] = [];
      let finalized = false;

      async function finalizeAgentStream(
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
          estimatedPromptTokens: estimatedTokens,
          streamedCompletionChars: 0,
        });

        if (budgetClaim) {
          await finalizeTeamAiBudgetClaimWithRetry({
            claimId: budgetClaim.claimId,
            actualTokens: resolvedUsage.actualTokens,
            context: { teamId: resolvedTeamId, userId: resolvedUserId, model },
            onFinalizeFailureMessage: "Failed to finalize AI budget claim",
            onEnqueueFailureMessage:
              "Failed to enqueue AI budget finalize retry after stream finalization error",
          });
        }

        try {
          await insertAiUsageRow({
            teamId: resolvedTeamId,
            userId: resolvedUserId,
            model,
            promptTokens: resolvedUsage.promptTokens,
            completionTokens: resolvedUsage.completionTokens,
          });
          if (!budgetClaim) {
            await recordAiUsageMonthlyTotals({
              teamId: resolvedTeamId,
              actualTokens: resolvedUsage.actualTokens,
            });
          }
        } catch (error) {
          logger.error("Failed to persist AI usage bookkeeping", error, {
            teamId: resolvedTeamId,
            userId: resolvedUserId,
            model,
            promptTokens: resolvedUsage.promptTokens,
            completionTokens: resolvedUsage.completionTokens,
          });
        }

        logAuditEvent({
          action: "ai.chat.request",
          outcome,
          actorUserId: resolvedUserId,
          teamId: resolvedTeamId,
          metadata: {
            planKey: effectivePlanKey,
            accessMode: aiAccessMode,
            model,
            toolsEnabled: true,
            maxSteps,
            toolCalls: toolCallNames.length > 0 ? toolCallNames : undefined,
            budgetClaimId: budgetClaim?.claimId,
            promptTokens: resolvedUsage.promptTokens,
            completionTokens: resolvedUsage.completionTokens,
            usageFallbackApplied: resolvedUsage.usedFallback,
            requestModalities,
            attachmentCounts,
            ...(reason ? { reason } : {}),
          },
        });
      }

      const aiResult = streamText({
        model: languageModel,
        messages: toModelMessages(body.messages),
        tools: AI_TOOL_MAP,
        stopWhen: stepCountIs(maxSteps),
        abortSignal: upstreamAbortController.signal,
        maxOutputTokens: AI_COMPLETION_MAX_TOKENS,
        onStepFinish: ({ usage: stepUsage, toolCalls }) => {
          accumulatedUsage.promptTokens += stepUsage.inputTokens ?? 0;
          accumulatedUsage.completionTokens += stepUsage.outputTokens ?? 0;
          for (const tc of toolCalls) {
            toolCallNames.push(tc.toolName);
          }

          if (budgetClaim) {
            const actualTokens = accumulatedUsage.promptTokens + accumulatedUsage.completionTokens;
            if (actualTokens >= projectedRequestTokens) {
              upstreamAbortController.abort("budget_exhausted");
            }
          }
        },
        onFinish: async ({ totalUsage, text }) => {
          await finalizeAgentStream(
            totalUsage.inputTokens ?? 0,
            totalUsage.outputTokens ?? 0,
            "success",
          );

          // Persist messages to thread
          if (resolvedThreadId || body.threadId === undefined) {
            try {
              if (!resolvedThreadId) {
                const lastUserMessage = body.messages.findLast((m) => m.role === "user");
                const thread = await createThread({
                  teamId: resolvedTeamId,
                  userId: resolvedUserId,
                  title: getUserMessageTitle(lastUserMessage),
                });
                if (thread) resolvedThreadId = thread.id;
              }
              if (resolvedThreadId) {
                const lastUserMessage = body.messages.findLast((m) => m.role === "user");
                const messagesToSave = [
                  ...(lastUserMessage?.role === "user"
                    ? [
                        {
                          role: "user" as const,
                          parts: toPersistedUserMessageParts(lastUserMessage),
                          attachments: lastUserMessage.attachments,
                        },
                      ]
                    : []),
                  {
                    role: "assistant" as const,
                    parts: [{ type: "text", text }],
                    metadata: {
                      model,
                      promptTokens: totalUsage.inputTokens ?? 0,
                      completionTokens: totalUsage.outputTokens ?? 0,
                      toolCalls: toolCallNames.length > 0 ? toolCallNames : undefined,
                      durationMs: Date.now() - requestStartTime,
                    },
                  },
                ];
                await saveThreadMessages({
                  threadId: resolvedThreadId,
                  teamId: resolvedTeamId,
                  userId: resolvedUserId,
                  messages: messagesToSave,
                  ownershipVerified: true,
                });
              }
            } catch (error) {
              logger.error("Failed to persist thread messages", error, {
                threadId: resolvedThreadId,
                teamId: resolvedTeamId,
              });
            }
          }
        },
        onError: async ({ error }) => {
          logger.error("Agent stream error", error, {
            teamId: resolvedTeamId,
            userId: resolvedUserId,
            model,
          });
          await finalizeAgentStream(
            accumulatedUsage.promptTokens,
            accumulatedUsage.completionTokens,
            "failure",
            "stream_failed",
          );
        },
        onAbort: async () => {
          await finalizeAgentStream(
            accumulatedUsage.promptTokens,
            accumulatedUsage.completionTokens,
            "failure",
            getAbortAuditReason(upstreamAbortController.signal.reason),
          );
        },
      });

      return withRequestId(
        aiResult.toUIMessageStreamResponse({
          headers: { "Cache-Control": "no-store" },
          consumeSseStream: consumeStream,
          sendSources: true,
          messageMetadata: ({ part }) => {
            if (part.type === "start" || part.type === "finish") {
              return {
                model,
                timestamp: new Date().toISOString(),
                threadId: resolvedThreadId,
              };
            }
            return undefined;
          },
        }),
        requestId,
      );
    }

    // ── Single-turn path: plain text stream (unchanged behavior) ──
    const aiResult = streamText({
      model: languageModel,
      messages: toModelMessages(body.messages),
      abortSignal: upstreamAbortController.signal,
      maxOutputTokens: AI_COMPLETION_MAX_TOKENS,
    });

    const encoder = new TextEncoder();
    const usage: UsageTotals = { promptTokens: 0, completionTokens: 0 };
    let streamedCompletionChars = 0;
    let completionText = "";

    const responseBody = new ReadableStream<Uint8Array>({
      async start(controller) {
        let streamError: unknown | null = null;

        try {
          for await (const part of aiResult.fullStream) {
            if (part.type === "text-delta") {
              controller.enqueue(encoder.encode(part.text));
              streamedCompletionChars += part.text.length;
              completionText += part.text;
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
            estimatedPromptTokens: estimatedTokens,
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
            if (!budgetClaim) {
              await recordAiUsageMonthlyTotals({
                teamId: teamContext.teamId,
                actualTokens: resolvedUsage.actualTokens,
              });
            }
          } catch (error) {
            logger.error("Failed to persist AI usage bookkeeping", error, {
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

          // Persist messages to thread (single-turn path)
          if (completionText.length > 0 && (resolvedThreadId || body.threadId === undefined)) {
            try {
              if (!resolvedThreadId) {
                const lastUserMessage = body.messages.findLast((m) => m.role === "user");
                const thread = await createThread({
                  teamId: teamContext.teamId,
                  userId: user.id,
                  title: getUserMessageTitle(lastUserMessage),
                });
                if (thread) resolvedThreadId = thread.id;
              }
              if (resolvedThreadId) {
                const lastUserMessage = body.messages.findLast((m) => m.role === "user");
                const messagesToSave = [
                  ...(lastUserMessage?.role === "user"
                    ? [
                        {
                          role: "user" as const,
                          parts: toPersistedUserMessageParts(lastUserMessage),
                          attachments: lastUserMessage.attachments,
                        },
                      ]
                    : []),
                  {
                    role: "assistant" as const,
                    parts: [{ type: "text", text: completionText }],
                    metadata: {
                      model,
                      promptTokens: resolvedUsage.promptTokens,
                      completionTokens: resolvedUsage.completionTokens,
                      durationMs: Date.now() - requestStartTime,
                    },
                  },
                ];
                await saveThreadMessages({
                  threadId: resolvedThreadId,
                  teamId: teamContext.teamId,
                  userId: user.id,
                  messages: messagesToSave,
                  ownershipVerified: true,
                });
              }
            } catch (error) {
              logger.error("Failed to persist thread messages (single-turn)", error, {
                threadId: resolvedThreadId,
                teamId: teamContext.teamId,
              });
            }
          }
        }
      },
      cancel() {
        upstreamAbortController.abort("downstream_cancelled");
      },
    });

    return withRequestId(
      new Response(responseBody, {
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
