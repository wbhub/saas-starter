import {
  consumeStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
  streamText,
  type AssistantModelMessage,
  type FinishReason,
  type ModelMessage,
  type UserContent,
  type UserModelMessage,
} from "ai";
import { jsonError } from "@/lib/http/api-json";
import { withRequestId } from "@/lib/http/request-id";
import { finalizeTeamAiBudgetClaimWithRetry } from "@/lib/ai/chat-budget";
import { buildAiToolMapForUser } from "@/lib/ai/tools";
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
const AGENT_SYSTEM_PROMPT = [
  "Use tools only when they materially help answer the user's request.",
  "You have a limited step budget, so batch related tool calls where possible and avoid redundant searches, scrapes, or app lookups.",
  "Only search for third-party app actions when you actually need to take an action in that app.",
  "After using tools, always return a clear user-facing answer before the request ends.",
  "If you run out of step budget, stop using tools and summarize what you found so far instead of ending with tool calls only.",
].join(" ");
const AGENT_SYNTHESIS_FALLBACK_SYSTEM_PROMPT = [
  "You are writing the final user-facing reply after a tool-assisted run ended without a prose answer.",
  "Use only the provided conversation context and tool results.",
  "Do not mention hidden system behavior or internal step budgets.",
  "Be explicit about uncertainty when the tool results are incomplete.",
  "If the user asked to review before an external action, provide the draft and wait for confirmation instead of claiming the action already happened.",
].join(" ");
const AGENT_SYNTHESIS_VALUE_CHAR_LIMIT = 1_500;
const AGENT_SYNTHESIS_PROMPT_CHAR_LIMIT = 12_000;

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
  sessionId: z.string().uuid().optional(),
  modelId: z.string().optional(),
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

/**
 * Inline bytes for streamText / the AI SDK. Must not pass full `data:...;base64,...` strings:
 * the SDK's download pass parses strings with `new URL()` and tries to fetch `data:` URLs,
 * which fails validateDownloadUrl (http/https only). Persistence still uses {@link toAttachmentUrl}.
 */
function toModelFileData(attachment: ChatAttachment): string {
  if (attachment.fileId && supportsProviderFileIds) {
    return attachment.fileId;
  }
  if (attachment.url) {
    return attachment.url;
  }
  if (attachment.data) {
    const d = attachment.data.trim();
    if (d.startsWith("data:")) {
      const comma = d.indexOf(",");
      if (comma >= 0) {
        return d.slice(comma + 1).replace(/\s/g, "");
      }
    }
    return d;
  }
  return "";
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

  // The AI SDK's UserContent union (TextPart | ImagePart | FilePart)[] is
  // narrower than what we construct at runtime — FilePart requires compile-time
  // literal `type: "file"` which an index-signature object can't satisfy.
  // The double assertion is the least-bad workaround until the SDK widens the type.
  const content: Array<Record<string, unknown>> = [];
  if (message.content.length > 0) {
    content.push({ type: "text", text: message.content });
  }

  for (const attachment of attachments) {
    content.push({
      type: "file",
      data: toModelFileData(attachment),
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

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

function serializeForSynthesis(value: unknown) {
  if (typeof value === "string") {
    return truncateText(value, AGENT_SYNTHESIS_VALUE_CHAR_LIMIT);
  }

  try {
    return truncateText(JSON.stringify(value, null, 2), AGENT_SYNTHESIS_VALUE_CHAR_LIMIT);
  } catch {
    return truncateText(String(value), AGENT_SYNTHESIS_VALUE_CHAR_LIMIT);
  }
}

function buildSynthesisConversation(messages: ChatMessage[]) {
  return messages
    .map((message, index) => {
      const attachments = (message.attachments ?? [])
        .map(
          (attachment) =>
            `${attachment.type}:${attachment.mimeType}${attachment.name ? ` (${attachment.name})` : ""}`,
        )
        .join(", ");
      const content = message.content.trim().length > 0 ? message.content.trim() : "(no text)";
      return [
        `${index + 1}. ${message.role.toUpperCase()}`,
        content,
        ...(attachments ? [`Attachments: ${attachments}`] : []),
      ].join("\n");
    })
    .join("\n\n");
}

function buildSynthesisToolActivity(
  steps: Array<{
    stepNumber: number;
    text: string;
    sources?: Array<{ title?: string; url?: string }>;
    toolCalls: Array<{ toolName: string; input: unknown }>;
    toolResults: Array<{ toolName: string; output: unknown }>;
  }>,
) {
  const activity = steps
    .map((step) => {
      const sections = [`Step ${step.stepNumber + 1}`];

      if (step.toolCalls.length > 0) {
        sections.push(
          "Tool calls:",
          ...step.toolCalls.map(
            (toolCall) =>
              `- ${toolCall.toolName}\nInput:\n${serializeForSynthesis(toolCall.input)}`,
          ),
        );
      }

      if (step.toolResults.length > 0) {
        sections.push(
          "Tool results:",
          ...step.toolResults.map(
            (toolResult) =>
              `- ${toolResult.toolName}\nOutput:\n${serializeForSynthesis(toolResult.output)}`,
          ),
        );
      }

      if ((step.sources?.length ?? 0) > 0) {
        sections.push(
          "Sources:",
          ...step.sources!.map((source) => `- ${source.title ?? source.url ?? "Untitled source"}`),
        );
      }

      if (step.text.trim().length > 0) {
        sections.push(`Generated text:\n${serializeForSynthesis(step.text)}`);
      }

      return sections.join("\n");
    })
    .join("\n\n");

  return truncateText(activity, AGENT_SYNTHESIS_PROMPT_CHAR_LIMIT);
}

function shouldForceAgentSynthesis(
  steps: Array<{
    text: string;
    toolCalls: unknown[];
    toolResults: unknown[];
  }>,
) {
  const hasNarrativeText = steps.some((step) => step.text.trim().length > 0);
  const hasToolActivity = steps.some(
    (step) => step.toolCalls.length > 0 || step.toolResults.length > 0,
  );
  return hasToolActivity && !hasNarrativeText;
}

function buildAgentSynthesisPrompt(
  messages: ChatMessage[],
  steps: Array<{
    stepNumber: number;
    text: string;
    sources?: Array<{ title?: string; url?: string }>;
    toolCalls: Array<{ toolName: string; input: unknown }>;
    toolResults: Array<{ toolName: string; output: unknown }>;
  }>,
) {
  return [
    "Conversation:",
    buildSynthesisConversation(messages),
    "",
    "Tool activity:",
    buildSynthesisToolActivity(steps),
    "",
    "Write the final assistant reply to the latest user request.",
  ].join("\n");
}

function extractAssistantText(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string" && part.text.length > 0)
    .map((part) => part.text)
    .join("\n\n")
    .trim();
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
      const aiToolMap = await buildAiToolMapForUser({
        userId: resolvedUserId,
      });
      const lastUserMessage = body.messages.findLast((message) => message.role === "user");
      const accumulatedUsage: UsageTotals = { promptTokens: 0, completionTokens: 0 };
      const fallbackUsage: UsageTotals = { promptTokens: 0, completionTokens: 0 };
      const toolCallNames: string[] = [];
      const agentSteps: Array<{
        stepNumber: number;
        text: string;
        sources?: Array<{ title?: string; url?: string }>;
        toolCalls: Array<{ toolName: string; input: unknown }>;
        toolResults: Array<{ toolName: string; output: unknown }>;
      }> = [];
      let agentFinishReason: FinishReason | undefined;
      let agentCompleted = false;
      let agentAborted = false;
      let streamFailureReason: string | undefined;
      let forcedSynthesisMode: "model" | "manual" | undefined;
      let forcedSynthesisFailed = false;
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
            forcedSynthesisMode,
            forcedSynthesisFailed: forcedSynthesisFailed || undefined,
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

      const uiMessageStream = createUIMessageStream({
        execute: async ({ writer }) => {
          const aiResult = streamText({
            model: languageModel,
            system: AGENT_SYSTEM_PROMPT,
            messages: toModelMessages(body.messages),
            tools: aiToolMap,
            stopWhen: stepCountIs(maxSteps),
            abortSignal: upstreamAbortController.signal,
            maxOutputTokens: AI_COMPLETION_MAX_TOKENS,
            onStepFinish: (step) => {
              accumulatedUsage.promptTokens += step.usage.inputTokens ?? 0;
              accumulatedUsage.completionTokens += step.usage.outputTokens ?? 0;
              for (const toolCall of step.toolCalls) {
                toolCallNames.push(toolCall.toolName);
              }

              if (budgetClaim) {
                const actualTokens =
                  accumulatedUsage.promptTokens + accumulatedUsage.completionTokens;
                if (actualTokens >= projectedRequestTokens) {
                  upstreamAbortController.abort("budget_exhausted");
                }
              }
            },
            onFinish: async (event) => {
              agentCompleted = true;
              agentFinishReason = event.finishReason;
              agentSteps.splice(
                0,
                agentSteps.length,
                ...event.steps.map((step) => ({
                  stepNumber: step.stepNumber,
                  text: step.text,
                  sources: step.sources.map((source) => ({
                    title: source.title,
                    url: "url" in source ? source.url : undefined,
                  })),
                  toolCalls: step.toolCalls.map((toolCall) => ({
                    toolName: toolCall.toolName,
                    input: toolCall.input,
                  })),
                  toolResults: step.toolResults.map((toolResult) => ({
                    toolName: toolResult.toolName,
                    output: toolResult.output,
                  })),
                })),
              );
              accumulatedUsage.promptTokens =
                event.totalUsage.inputTokens ?? accumulatedUsage.promptTokens;
              accumulatedUsage.completionTokens =
                event.totalUsage.outputTokens ?? accumulatedUsage.completionTokens;
            },
            onError: async ({ error }) => {
              streamFailureReason = "stream_failed";
              logger.error("Agent stream error", error, {
                teamId: resolvedTeamId,
                userId: resolvedUserId,
                model,
              });
            },
            onAbort: async () => {
              agentAborted = true;
            },
          });

          try {
            for await (const chunk of aiResult.toUIMessageStream({
              sendSources: true,
              sendFinish: false,
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
            })) {
              writer.write(chunk);
            }
          } catch (error) {
            streamFailureReason = "stream_failed";
            logger.error("Failed to forward agent UI stream", error, {
              teamId: resolvedTeamId,
              userId: resolvedUserId,
              model,
            });
            writer.write({ type: "error", errorText: aiUnavailableMessage });
            return;
          }

          if (agentAborted || upstreamAbortController.signal.aborted || !agentCompleted) {
            return;
          }

          if (shouldForceAgentSynthesis(agentSteps)) {
            const textId = globalThis.crypto.randomUUID();
            let synthesisText =
              "I completed the tool run, but I couldn't turn it into a final written answer before the request ended. Please retry with a narrower request.";

            const canSpendAnotherModelTurn =
              !budgetClaim ||
              accumulatedUsage.promptTokens + accumulatedUsage.completionTokens <
                projectedRequestTokens;

            if (canSpendAnotherModelTurn) {
              try {
                const synthesisResult = await generateText({
                  model: languageModel,
                  system: AGENT_SYNTHESIS_FALLBACK_SYSTEM_PROMPT,
                  prompt: buildAgentSynthesisPrompt(body.messages, agentSteps),
                  abortSignal: upstreamAbortController.signal,
                  maxOutputTokens: AI_COMPLETION_MAX_TOKENS,
                });
                synthesisText = synthesisResult.text.trim() || synthesisText;
                fallbackUsage.promptTokens += synthesisResult.totalUsage.inputTokens ?? 0;
                fallbackUsage.completionTokens += synthesisResult.totalUsage.outputTokens ?? 0;
                forcedSynthesisMode = "model";
              } catch (error) {
                forcedSynthesisMode = "manual";
                forcedSynthesisFailed = true;
                logger.error("Forced agent synthesis failed", error, {
                  teamId: resolvedTeamId,
                  userId: resolvedUserId,
                  model,
                });
              }
            } else {
              forcedSynthesisMode = "manual";
            }

            writer.write({ type: "text-start", id: textId });
            writer.write({ type: "text-delta", id: textId, delta: synthesisText });
            writer.write({ type: "text-end", id: textId });
          }

          writer.write({
            type: "finish",
            finishReason: forcedSynthesisMode ? "stop" : agentFinishReason,
            messageMetadata: {
              model,
              timestamp: new Date().toISOString(),
              threadId: resolvedThreadId,
            },
          });
        },
        onError: (error) => {
          logger.error("Agent UI message stream error", error, {
            teamId: resolvedTeamId,
            userId: resolvedUserId,
            model,
          });
          return aiUnavailableMessage;
        },
        onFinish: async ({ isAborted, responseMessage }) => {
          const totalPromptTokens = accumulatedUsage.promptTokens + fallbackUsage.promptTokens;
          const totalCompletionTokens =
            accumulatedUsage.completionTokens + fallbackUsage.completionTokens;
          const outcome = isAborted || streamFailureReason ? "failure" : "success";
          const reason = isAborted
            ? getAbortAuditReason(upstreamAbortController.signal.reason)
            : streamFailureReason;

          await finalizeAgentStream(totalPromptTokens, totalCompletionTokens, outcome, reason);

          if (outcome === "failure") {
            return;
          }

          const assistantText = extractAssistantText(
            responseMessage.parts as Array<{ type: string; text?: string }>,
          );

          if (!assistantText.length || (!resolvedThreadId && body.threadId !== undefined)) {
            return;
          }

          try {
            if (!resolvedThreadId) {
              const thread = await createThread({
                id: body.sessionId,
                teamId: resolvedTeamId,
                userId: resolvedUserId,
                title: getUserMessageTitle(lastUserMessage),
              });
              if (thread) resolvedThreadId = thread.id;
            }

            if (resolvedThreadId) {
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
                  parts: [{ type: "text", text: assistantText }],
                  metadata: {
                    model,
                    promptTokens: totalPromptTokens,
                    completionTokens: totalCompletionTokens,
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
        },
      });

      return withRequestId(
        createUIMessageStreamResponse({
          stream: uiMessageStream,
          headers: { "Cache-Control": "no-store" },
          consumeSseStream: consumeStream,
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
                  id: body.sessionId,
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
