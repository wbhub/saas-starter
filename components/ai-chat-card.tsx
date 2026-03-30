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
  resolveAttachmentMimeType,
  SUPPORTED_IMAGE_MIME_TYPES,
  toProviderFilePlaceholderUrl,
} from "@/lib/ai/attachments";
import { Sparkles } from "lucide-react";
import { Conversation } from "@/components/ai/conversation";
import { MessageBubble } from "@/components/ai/message-bubble";
import { PromptInput } from "@/components/ai/prompt-input";
import { ThreadSidebar } from "@/components/ai/thread-sidebar";
import { Button } from "@/components/ui/button";
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
  const mediaType = resolveMimeType(file) || "application/octet-stream";
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
    reader.readAsDataURL(file);
  });

  return {
    type: "file" as const,
    mediaType,
    filename: file.name,
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
}: {
  providerName: AttachmentProviderName;
  toolsEnabled: boolean;
}) {
  const t = useTranslations("AiChatCard");
  const [chatSessionId, setChatSessionId] = useState(() => crypto.randomUUID());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [threadRefreshSignal, setThreadRefreshSignal] = useState(0);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const threadSwitchAbortRef = useRef<AbortController | null>(null);

  const transport = useMemo(() => {
    const prepareSendMessagesRequest = ({
      body,
      messages,
      ...request
    }: {
      body: Record<string, unknown> | undefined;
      messages: UIMessage[];
      [key: string]: unknown;
    }) => ({
      ...request,
      body: {
        ...body,
        messages: toApiChatMessages(messages, providerName),
        ...(activeThreadId ? { threadId: activeThreadId } : {}),
      },
    });

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
  }, [toolsEnabled, activeThreadId, providerName]);

  const { messages, sendMessage, status, stop, error, clearError, setMessages } = useChat({
    id: chatSessionId,
    transport,
  });

  // Rehydrate messages when initialMessages changes (thread load or clear)
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, setMessages]);

  // Abort in-flight thread load on unmount
  useEffect(() => {
    return () => {
      threadSwitchAbortRef.current?.abort();
    };
  }, []);

  const errorMessagesByCode = {
    budget_exceeded: t("errors.budgetExceeded"),
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
        if (isSupportedFileMimeType(mimeType, providerName)) {
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

  async function handleSubmit(text: string, files: File[]) {
    clearError();
    setUploadErrorMessage(null);
    try {
      const fileParts = await Promise.all(
        files.map((file) => {
          const mimeType = resolveMimeType(file);
          if (isSupportedFileMimeType(mimeType, providerName)) {
            return providerFileToUiPart(file, providerName);
          }
          return fileToUiPart(file);
        }),
      );
      await sendMessage({
        text,
        ...(fileParts.length > 0 ? { files: fileParts } : {}),
      });
      // Refresh thread sidebar after send
      setThreadRefreshSignal((k) => k + 1);
    } catch (error) {
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
  }

  return (
    <div className="flex min-h-[min(560px,calc(100vh-260px))] flex-col overflow-hidden lg:flex-row">
      <ThreadSidebar
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        refreshSignal={threadRefreshSignal}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "border-b border-border/50 bg-gradient-to-r from-muted/30 to-transparent",
            "px-5 py-4 sm:px-6",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{t("title")}</h2>
              <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
                {t("description")}
              </p>
            </div>
            {isSending ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-primary/25",
                  "bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary",
                )}
              >
                <span className="relative flex h-2 w-2">
                  <span
                    className={cn(
                      "absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60",
                      "opacity-75",
                    )}
                  />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                {t("actions.sending")}
              </span>
            ) : null}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-0 px-5 py-4 sm:px-6">
          <Conversation>
            {messages.length === 0 ? (
              <div
                className={cn(
                  "flex min-h-[220px] flex-col items-center justify-center gap-4 px-4 py-12",
                  "text-center",
                )}
              >
                <div
                  className={cn(
                    "flex size-14 items-center justify-center rounded-2xl",
                    "bg-primary/10 text-primary shadow-inner ring-1 ring-primary/15",
                  )}
                >
                  <Sparkles className="size-7" aria-hidden />
                </div>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {t("emptyState")}
                </p>
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
                "mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700",
                "dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200",
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

          {isSending ? (
            <div className="mt-3 flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => void stop()}>
                {t("actions.stop")}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="border-t border-border/50 bg-muted/20 px-5 py-4 sm:px-6 dark:bg-muted/10">
          <PromptInput
            onSubmit={(text, files) => void handleSubmit(text, files)}
            isSending={isSending}
            providerName={providerName}
            validateFiles={validateFiles}
          />
        </div>
      </div>
    </div>
  );
}
