"use client";

import { useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  TextStreamChatTransport,
  type UIMessage,
} from "ai";
import { useTranslations } from "next-intl";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { resolveUserFacingErrorMessage } from "@/lib/ai/error-message";
import {
  type AttachmentProviderName,
  EXTENSION_MIME_MAP,
  getSupportedAttachmentAccept,
  isSupportedFileMimeType,
  SUPPORTED_IMAGE_MIME_TYPES,
} from "@/lib/ai/attachments";

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

function toApiAttachment(part: {
  mediaType: string;
  filename?: string;
  url: string;
  providerMetadata?: unknown;
}) {
  const mimeType = part.mediaType.toLowerCase();
  const fileType = mimeType.startsWith("image/") ? "image" : "file";
  const source = (() => {
    const openAiFileId = (part.providerMetadata as { openai?: { fileId?: string } } | undefined)
      ?.openai?.fileId;
    if (typeof openAiFileId === "string" && openAiFileId.length > 0) {
      return { fileId: openAiFileId };
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
  const rawMimeType = file.type.trim().toLowerCase();
  if (rawMimeType.length > 0) {
    return rawMimeType;
  }
  const extension = file.name.toLowerCase().split(".").pop();
  if (!extension) {
    return "";
  }
  return EXTENSION_MIME_MAP[extension] ?? "";
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

  // Keep the newest attachments by trimming older message attachments first.
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

function toApiChatMessages(messages: UIMessage[]) {
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
                toApiAttachment({
                  mediaType: part.mediaType,
                  filename: part.filename,
                  url: part.url,
                  providerMetadata: part.providerMetadata,
                }),
              )
          : [];
      return {
        role: message.role,
        content,
        ...(attachments.length > 0 ? { attachments } : {}),
      };
    })
    .filter((message) => message.content.length > 0);

  const recentMessages = apiMessages.slice(-MAX_MESSAGES_PER_REQUEST);
  return enforceRequestAttachmentBudget(pruneHistoricalAttachments(recentMessages));
}

function ToolCallCard({
  toolName,
  args,
  result,
  state,
}: {
  toolName: string;
  args: unknown;
  result: unknown;
  state: string;
}) {
  return (
    <details className="max-w-[88%] rounded-lg border app-border-subtle bg-surface px-3 py-2 text-sm text-foreground">
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <span className="inline-block rounded bg-surface-hover px-1.5 py-0.5 font-mono text-xs">
          {toolName}
        </span>
        {state !== "output-available" && state !== "output-error" ? (
          <span className="text-xs text-muted-foreground">running…</span>
        ) : null}
      </summary>
      <div className="mt-2 space-y-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Input</p>
          <pre className="mt-0.5 overflow-x-auto rounded bg-surface-hover p-2 font-mono text-xs">
            {JSON.stringify(args, null, 2)}
          </pre>
        </div>
        {result !== undefined ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Output</p>
            <pre className="mt-0.5 overflow-x-auto rounded bg-surface-hover p-2 font-mono text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function AiChatCard({
  providerName,
  toolsEnabled,
}: {
  providerName: AttachmentProviderName;
  toolsEnabled: boolean;
}) {
  const t = useTranslations("AiChatCard");
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supportedAttachmentAccept = getSupportedAttachmentAccept(providerName);

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
        messages: toApiChatMessages(messages),
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
  }, [toolsEnabled]);

  const { messages, sendMessage, status, stop, error, clearError } = useChat({
    transport,
  });
  const errorMessagesByCode = {
    budget_exceeded: t("errors.budgetExceeded"),
    modality_not_allowed: t("errors.modalityNotAllowed"),
    plan_required: t("errors.planRequired"),
    upstream_rate_limited: t("errors.upstreamRateLimited"),
    upstream_bad_request: t("errors.upstreamBadRequest"),
    upstream_error: t("errors.upstreamError"),
  };

  const isSending = status === "submitted" || status === "streaming";

  function validateFiles(files: File[]) {
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
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const validationError = validateFiles(files);
    setValidationMessage(validationError);
    if (validationError) {
      setPendingFiles([]);
      event.currentTarget.value = "";
      return;
    }
    setPendingFiles(files);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    const validationError = validateFiles(pendingFiles);
    if (validationError) {
      setValidationMessage(validationError);
      return;
    }
    if (!value || isSending) {
      return;
    }

    clearError();
    setValidationMessage(null);
    const draftInput = value;
    const draftFiles = [...pendingFiles];
    setInput("");
    setPendingFiles([]);

    try {
      const fileParts = await Promise.all(draftFiles.map((file) => fileToUiPart(file)));
      await sendMessage({
        text: draftInput,
        ...(fileParts.length > 0 ? { files: fileParts } : {}),
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (submitError) {
      setInput(draftInput);
      setPendingFiles(draftFiles);
      setValidationMessage(
        resolveUserFacingErrorMessage(submitError, t("errors.requestFailed"), errorMessagesByCode),
      );
    }
  }

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <header>
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </header>

      <div className="mt-4 max-h-[460px] space-y-3 overflow-y-auto rounded-lg app-surface-subtle p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyState")}</p>
        ) : (
          messages.map((message) => {
            const isUser = message.role === "user";
            const hasContent = message.parts.some(
              (part) => (part.type === "text" && part.text.length > 0) || isToolUIPart(part),
            );
            if (!hasContent) {
              return null;
            }

            return (
              <div key={message.id} className="space-y-2">
                {message.parts.map((part, partIndex) => {
                  if (part.type === "text" && part.text.length > 0) {
                    return (
                      <div
                        key={partIndex}
                        className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${
                          isUser ? "ml-auto bg-btn-accent text-white" : "bg-surface text-foreground"
                        }`}
                      >
                        {part.text}
                      </div>
                    );
                  }
                  if (isToolUIPart(part)) {
                    return (
                      <ToolCallCard
                        key={partIndex}
                        toolName={getToolName(part)}
                        args={part.input}
                        result={part.state === "output-available" ? part.output : undefined}
                        state={part.state}
                      />
                    );
                  }
                  return null;
                })}
              </div>
            );
          })
        )}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {resolveUserFacingErrorMessage(error, t("errors.requestFailed"), errorMessagesByCode)}
        </p>
      ) : null}
      {validationMessage ? (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          {validationMessage}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-4 space-y-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={4}
          placeholder={t("placeholder")}
          disabled={isSending}
          className="w-full rounded-lg border app-border-subtle app-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        <div className="space-y-2">
          <label className="block text-sm font-medium text-muted-foreground">
            {t("attachments.label")}
          </label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            disabled={isSending}
            onChange={handleFileChange}
            accept={supportedAttachmentAccept}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border-subtle file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-surface-hover disabled:opacity-60"
          />
          {pendingFiles.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("attachments.selected", { count: pendingFiles.length })}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSending || input.trim().length === 0}
            className="rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-text hover:bg-btn-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? t("actions.sending") : t("actions.send")}
          </button>
          {isSending ? (
            <button
              type="button"
              onClick={() => void stop()}
              className="rounded-lg border app-border-subtle px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-hover"
            >
              {t("actions.stop")}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
