"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, TextStreamChatTransport, type UIMessage } from "ai";
import { useTranslations } from "next-intl";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { resolveUserFacingErrorMessage } from "@/lib/ai/error-message";
import {
  type AttachmentProviderName,
  getProviderFileId,
  isSupportedFileMimeType,
  providerSupportsFileIds,
  providerSupportsUploadedFileReferences,
  resolveAttachmentMimeType,
  SUPPORTED_IMAGE_MIME_TYPES,
  toProviderFilePlaceholderUrl,
} from "@/lib/ai/attachments";
import {
  CHAT_IMAGE_COMPRESS_LONG_EDGE_PX,
  ChatImageCompressionError,
  compressImageFileForChat,
  MAX_CHAT_IMAGE_RAW_BYTES,
  MAX_CHAT_IMAGE_RAW_MB,
} from "@/lib/ai/compress-chat-image";
import { Conversation } from "@/components/ai/conversation";
import { MessageBubble } from "@/components/ai/message-bubble";
import { PromptInput } from "@/components/ai/prompt-input";
import { ThreadSidebar } from "@/components/ai/thread-sidebar";
import { cn } from "@/lib/utils";

const MAX_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_ATTACHMENTS_PER_REQUEST = 16;
const MAX_ATTACHMENT_DATA_CHARS = 180_000;
const MAX_TOTAL_ATTACHMENT_DATA_CHARS = 220_000;
const MAX_MESSAGES_PER_REQUEST = 30;
const MAX_MESSAGE_CONTENT_CHARS = 8_000;

function getMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function toApiAttachment(
  part: {
    mediaType: string;
    filename?: string;
    url: string;
    providerMetadata?: unknown;
  },
  providerName: AttachmentProviderName,
) {
  const mimeType = part.mediaType.toLowerCase();
  const fileType = mimeType.startsWith("image/") ? "image" : "file";
  const source = (() => {
    const providerFileId = getProviderFileId(providerName, part.providerMetadata);
    if (providerFileId) {
      return { fileId: providerFileId };
    }
    if (part.url.startsWith("data:")) {
      return { data: part.url };
    }
    return { url: part.url };
  })();

  return {
    type: fileType,
    mimeType,
    ...(part.filename ? { name: part.filename } : {}),
    ...source,
  };
}

function estimateDataUrlLength(sizeInBytes: number, mimeType: string) {
  const base64Length = 4 * Math.ceil(sizeInBytes / 3);
  return `data:${mimeType};base64,`.length + base64Length;
}

function resolveMimeType(file: File) {
  return resolveAttachmentMimeType({
    mimeType: file.type,
    fileName: file.name,
  });
}

function enforceRequestAttachmentBudget(
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    attachments?: Array<Record<string, unknown>>;
  }>,
) {
  let attachmentCount = messages.reduce(
    (sum, message) => sum + (message.attachments?.length ?? 0),
    0,
  );

  if (attachmentCount <= MAX_ATTACHMENTS_PER_REQUEST) {
    return messages;
  }

  for (const message of messages) {
    if (!message.attachments?.length) {
      continue;
    }
    while (message.attachments.length > 0 && attachmentCount > MAX_ATTACHMENTS_PER_REQUEST) {
      message.attachments.shift();
      attachmentCount -= 1;
    }
    if (message.attachments.length === 0) {
      delete message.attachments;
    }
    if (attachmentCount <= MAX_ATTACHMENTS_PER_REQUEST) {
      break;
    }
  }

  return messages;
}

function pruneHistoricalAttachments(
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    attachments?: Array<Record<string, unknown>>;
  }>,
) {
  let latestUserAttachmentIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && (message.attachments?.length ?? 0) > 0) {
      latestUserAttachmentIndex = index;
      break;
    }
  }

  if (latestUserAttachmentIndex === -1) {
    return messages;
  }

  return messages.map((message, index) => {
    if (message.role === "user" && index !== latestUserAttachmentIndex && message.attachments) {
      return {
        ...message,
        attachments: undefined,
      };
    }
    return message;
  });
}

async function fileToUiPart(file: File) {
  let workFile = file;
  let mediaType = resolveMimeType(file) || "application/octet-stream";
  if (SUPPORTED_IMAGE_MIME_TYPES.has(mediaType)) {
    workFile = await compressImageFileForChat(file, {
      maxDataUrlChars: MAX_ATTACHMENT_DATA_CHARS,
      maxLongEdgePx: CHAT_IMAGE_COMPRESS_LONG_EDGE_PX,
    });
    mediaType = resolveMimeType(workFile) || mediaType;
  }

  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to read selected file."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read selected file."));
    reader.readAsDataURL(workFile);
  });

  return {
    type: "file" as const,
    mediaType,
    filename: workFile.name,
    url,
  };
}

async function providerFileToUiPart(file: File, providerName: AttachmentProviderName) {
  const response = await fetch("/api/ai/files", {
    method: "POST",
    headers: getCsrfHeaders(),
    body: (() => {
      const formData = new FormData();
      formData.set("file", file);
      return formData;
    })(),
  });

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    fileId?: string;
    url?: string;
  } | null;

  if (
    !response.ok ||
    payload?.ok !== true ||
    (typeof payload.fileId !== "string" && typeof payload.url !== "string")
  ) {
    throw new Error(payload?.error ?? "File upload failed.");
  }

  const fileId =
    typeof payload.fileId === "string" && providerSupportsFileIds(providerName)
      ? payload.fileId
      : undefined;

  return {
    type: "file" as const,
    mediaType: resolveMimeType(file) || "application/octet-stream",
    filename: file.name,
    url:
      fileId && providerSupportsFileIds(providerName)
        ? toProviderFilePlaceholderUrl(providerName, fileId)
        : (payload.url as string),
    ...(fileId
      ? {
          providerMetadata: {
            [providerName]: {
              fileId,
            },
          },
        }
      : {}),
  };
}

function toApiChatMessages(messages: UIMessage[], providerName: AttachmentProviderName) {
  const apiMessages = messages
    .filter(
      (message): message is UIMessage & { role: "user" | "assistant" } =>
        message.role === "user" || message.role === "assistant",
    )
    .map((message) => {
      const content = getMessageText(message).trim().slice(0, MAX_MESSAGE_CONTENT_CHARS);
      const attachments =
        message.role === "user"
          ? message.parts
              .filter((part) => part.type === "file")
              .map((part) =>
                toApiAttachment(
                  {
                    mediaType: part.mediaType,
                    filename: part.filename,
                    url: part.url,
                    providerMetadata: part.providerMetadata,
                  },
                  providerName,
                ),
              )
          : [];
      return {
        role: message.role,
        content,
        ...(attachments.length > 0 ? { attachments } : {}),
      };
    })
    .filter((message) =>
      message.role === "user"
        ? message.content.length > 0 || (message.attachments?.length ?? 0) > 0
        : message.content.length > 0,
    );

  const recentMessages = apiMessages.slice(-MAX_MESSAGES_PER_REQUEST);
  return enforceRequestAttachmentBudget(pruneHistoricalAttachments(recentMessages));
}

export function AiChatCard({
  providerName,
  toolsEnabled,
  userDisplayName,
  availableModels,
}: {
  providerName: AttachmentProviderName;
  toolsEnabled: boolean;
  /** Passed from the dashboard for future personalization (e.g. greeting). */
  userDisplayName: string;
  availableModels?: string[];
}) {
  void userDisplayName;
  const t = useTranslations("AiChatCard");
  const [chatSessionId, setChatSessionId] = useState(() => crypto.randomUUID());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [threadRefreshSignal, setThreadRefreshSignal] = useState(0);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const threadSwitchAbortRef = useRef<AbortController | null>(null);

  const [selectedModelId, setSelectedModelId] = useState<string | undefined>();

  const transport = useMemo(() => {
    const prepareSendMessagesRequest = ({
      body,
      messages,
      ...request
    }: {
      body: Record<string, unknown> | undefined;
      messages: UIMessage[];
      [key: string]: unknown;
    }) => {
      const requestedModelId =
        typeof body?.modelId === "string" && body.modelId.trim().length > 0
          ? body.modelId.trim()
          : selectedModelId;
      return {
        ...request,
        body: {
          ...body,
          messages: toApiChatMessages(messages, providerName),
          sessionId: chatSessionId,
          ...(activeThreadId ? { threadId: activeThreadId } : {}),
          ...(requestedModelId ? { modelId: requestedModelId } : {}),
        },
      };
    };

    if (toolsEnabled) {
      return new DefaultChatTransport({
        api: "/api/ai/chat",
        headers: getCsrfHeaders,
        prepareSendMessagesRequest,
      });
    }
    return new TextStreamChatTransport({
      api: "/api/ai/chat",
      headers: getCsrfHeaders,
      prepareSendMessagesRequest,
    });
  }, [toolsEnabled, activeThreadId, providerName, chatSessionId, selectedModelId]);

  const { messages, sendMessage, status, stop, error, clearError, setMessages } = useChat({
    id: chatSessionId,
    transport,
  });

  // Rehydrate messages when initialMessages changes (thread load or clear)
  useEffect(() => {
    if (initialMessages.length > 0 || activeThreadId === null) {
      setMessages(initialMessages);
    }
  }, [initialMessages, activeThreadId, setMessages]);

  // Abort in-flight thread load on unmount
  useEffect(() => {
    return () => {
      threadSwitchAbortRef.current?.abort();
    };
  }, []);

  const errorMessagesByCode = {
    budget_exceeded: t("errors.budgetExceeded"),
    invalid_model: t("errors.requestFailed"),
    modality_not_allowed: t("errors.modalityNotAllowed"),
    plan_required: t("errors.planRequired"),
    upstream_rate_limited: t("errors.upstreamRateLimited"),
    upstream_bad_request: t("errors.upstreamBadRequest"),
    upstream_error: t("errors.upstreamError"),
  };

  const isSending = status === "submitted" || status === "streaming";

  const validateFiles = useCallback(
    (files: File[]) => {
      if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
        return t("errors.maxAttachments", { max: MAX_ATTACHMENTS_PER_MESSAGE });
      }
      let totalEncodedChars = 0;
      for (const file of files) {
        const mimeType = resolveMimeType(file);
        if (
          !SUPPORTED_IMAGE_MIME_TYPES.has(mimeType) &&
          !isSupportedFileMimeType(mimeType, providerName)
        ) {
          return t("errors.unsupportedType", { mimeType: mimeType || file.name || "unknown" });
        }
        if (
          isSupportedFileMimeType(mimeType, providerName) &&
          providerSupportsUploadedFileReferences(providerName)
        ) {
          continue;
        }
        if (SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
          if (file.size > MAX_CHAT_IMAGE_RAW_BYTES) {
            return t("errors.imageRawTooLarge", { maxMb: MAX_CHAT_IMAGE_RAW_MB });
          }
          continue;
        }
        const encodedChars = estimateDataUrlLength(file.size, mimeType);
        if (encodedChars > MAX_ATTACHMENT_DATA_CHARS) {
          return t("errors.fileTooLarge");
        }
        totalEncodedChars += encodedChars;
        if (totalEncodedChars > MAX_TOTAL_ATTACHMENT_DATA_CHARS) {
          return t("errors.totalAttachmentsTooLarge");
        }
      }
      return null;
    },
    [t, providerName],
  );

  async function handleSubmit(text: string, files: File[], modelId?: string) {
    setSelectedModelId(modelId);
    clearError();
    setUploadErrorMessage(null);
    try {
      const fileParts = await Promise.all(
        files.map((file) => {
          const mimeType = resolveMimeType(file);
          if (
            isSupportedFileMimeType(mimeType, providerName) &&
            providerSupportsUploadedFileReferences(providerName)
          ) {
            return providerFileToUiPart(file, providerName);
          }
          return fileToUiPart(file);
        }),
      );
      const totalDataUrlChars = fileParts.reduce((sum, part) => {
        if (part.url.startsWith("data:")) {
          return sum + part.url.length;
        }
        return sum;
      }, 0);
      if (totalDataUrlChars > MAX_TOTAL_ATTACHMENT_DATA_CHARS) {
        setUploadErrorMessage(t("errors.totalAttachmentsTooLarge"));
        return;
      }
      await sendMessage(
        {
          text,
          ...(fileParts.length > 0 ? { files: fileParts } : {}),
        },
        modelId ? { body: { modelId } } : undefined,
      );

      if (!activeThreadId) {
        setActiveThreadId(chatSessionId);
      }
      // Always refresh sidebar on send to ensure latest thread title/timestamp is visible
      setThreadRefreshSignal((k) => k + 1);
    } catch (error) {
      if (error instanceof ChatImageCompressionError) {
        if (error.code === "raw_too_large") {
          setUploadErrorMessage(t("errors.imageRawTooLarge", { maxMb: MAX_CHAT_IMAGE_RAW_MB }));
        } else if (error.code === "pixels_too_large") {
          setUploadErrorMessage(t("errors.imagePixelsTooLarge"));
        } else {
          setUploadErrorMessage(t("errors.imageCompressionFailed"));
        }
        return;
      }
      if (error instanceof Error && error.message.trim().length > 0) {
        setUploadErrorMessage(error.message);
      } else {
        setUploadErrorMessage(t("errors.upstreamError"));
      }
    }
  }

  async function handleSelectThread(threadId: string) {
    // Abort any in-flight thread load
    threadSwitchAbortRef.current?.abort();
    const controller = new AbortController();
    threadSwitchAbortRef.current = controller;

    try {
      const csrfHeaders = getCsrfHeaders();
      const response = await fetch(`/api/ai/threads/${threadId}/messages`, {
        headers: csrfHeaders,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (response.ok) {
        const data = await response.json();
        const loadedMessages: UIMessage[] = (data.messages ?? []).map(
          (msg: { id: string; role: string; parts: unknown[]; metadata?: unknown }) => ({
            id: msg.id,
            role: msg.role,
            parts: msg.parts,
            metadata: msg.metadata ?? {},
          }),
        );
        setChatSessionId(threadId);
        setActiveThreadId(threadId);
        setInitialMessages(loadedMessages);
      }
    } catch {
      // Silently fail (includes AbortError)
    }
  }

  function handleNewThread() {
    setChatSessionId(crypto.randomUUID());
    setActiveThreadId(null);
    setInitialMessages([]);
    setMessages([]);
  }

  return (
    <div className="flex h-[min(800px,calc(100vh-200px))] flex-col overflow-hidden lg:flex-row rounded-2xl bg-card ring-1 ring-border">
      <ThreadSidebar
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        refreshSignal={threadRefreshSignal}
      />
      <div className="flex min-w-0 flex-1 flex-col relative before:hidden lg:before:block before:absolute before:inset-y-4 before:left-0 before:w-px before:bg-border/40">
        <div className="flex min-h-0 flex-1 flex-col gap-0 px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-4xl flex-1 flex flex-col min-h-0">
            <Conversation>
              {messages.length === 0 ? (
                <div
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-4 px-4 py-12",
                    "text-center",
                  )}
                >
                  <h2 className="text-2xl font-medium text-foreground">What can I help with?</h2>
                </div>
              ) : (
                messages.map((message, index) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isStreaming={
                      isSending && message.role === "assistant" && index === messages.length - 1
                    }
                  />
                ))
              )}
            </Conversation>

            {error || uploadErrorMessage ? (
              <p
                className={cn(
                  "mt-3 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive",
                )}
              >
                {uploadErrorMessage
                  ? uploadErrorMessage
                  : resolveUserFacingErrorMessage(
                      error,
                      t("errors.requestFailed"),
                      errorMessagesByCode,
                    )}
              </p>
            ) : null}
          </div>
        </div>

        <div className="px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-4xl">
            <PromptInput
              onSubmit={(text, files, modelId) => void handleSubmit(text, files, modelId)}
              isSending={isSending}
              onStop={() => void stop()}
              providerName={providerName}
              validateFiles={validateFiles}
              availableModels={availableModels}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
