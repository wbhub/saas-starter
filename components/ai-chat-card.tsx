"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, TextStreamChatTransport, type UIMessage } from "ai";
import { ChevronLeft, ChevronRight, PanelLeft, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
import { getAiProviderNameForModel } from "@/lib/ai/provider-name";
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
import { ThreadSidebar, type ThreadSidebarThread } from "@/components/ai/thread-sidebar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const MAX_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_ATTACHMENTS_PER_REQUEST = 16;
const MAX_ATTACHMENT_DATA_CHARS = 180_000;
const MAX_TOTAL_ATTACHMENT_DATA_CHARS = 220_000;
const MAX_MESSAGES_PER_REQUEST = 30;
const MAX_MESSAGE_CONTENT_CHARS = 8_000;
const DESKTOP_RECENTS_AUTO_COLLAPSE_WIDTH_PX = 1280;
const DESKTOP_RECENTS_STORAGE_KEY = "aiChat.desktopRecentsCollapsed";
const DESKTOP_RECENTS_PREFERENCE_EVENT = "ai-chat.desktop-recents-preference-changed";
const CHAT_COLUMN_MAX_WIDTH_CLASS = "max-w-4xl";
const DESKTOP_CHAT_MAX_HEIGHT_PX = 58 * 16;
const DESKTOP_CHAT_BOTTOM_GAP_PX = 24;
let desktopThreadsManualFallback: boolean | null = null;

type DesktopThreadsPreferenceSnapshot = "auto:0" | "auto:1" | "manual:0" | "manual:1";

function getDesktopThreadsPreferenceSnapshot(): DesktopThreadsPreferenceSnapshot {
  if (typeof window === "undefined") {
    return "auto:0";
  }

  try {
    const storedPreference = window.localStorage.getItem(DESKTOP_RECENTS_STORAGE_KEY);
    if (storedPreference === "true" || storedPreference === "false") {
      return storedPreference === "true" ? "manual:1" : "manual:0";
    }
  } catch {
    if (desktopThreadsManualFallback !== null) {
      return desktopThreadsManualFallback ? "manual:1" : "manual:0";
    }
  }

  return window.innerWidth < DESKTOP_RECENTS_AUTO_COLLAPSE_WIDTH_PX ? "auto:1" : "auto:0";
}

function getServerDesktopThreadsPreferenceSnapshot(): DesktopThreadsPreferenceSnapshot {
  return "auto:0";
}

function subscribeDesktopThreadsPreference(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleResize = () => {
    if (getDesktopThreadsPreferenceSnapshot().startsWith("auto:")) {
      onStoreChange();
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== DESKTOP_RECENTS_STORAGE_KEY) {
      return;
    }
    desktopThreadsManualFallback = null;
    onStoreChange();
  };

  const handlePreferenceChange = () => {
    onStoreChange();
  };

  window.addEventListener("resize", handleResize);
  window.addEventListener("storage", handleStorage);
  window.addEventListener(DESKTOP_RECENTS_PREFERENCE_EVENT, handlePreferenceChange);

  return () => {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(DESKTOP_RECENTS_PREFERENCE_EVENT, handlePreferenceChange);
  };
}

function parseDesktopThreadsPreferenceSnapshot(snapshot: DesktopThreadsPreferenceSnapshot) {
  return {
    collapsed: snapshot.endsWith(":1"),
    hasManualPreference: snapshot.startsWith("manual:"),
  };
}

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
      formData.set("provider", providerName);
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
  defaultModelId,
  initialThreads,
}: {
  providerName: AttachmentProviderName;
  toolsEnabled: boolean;
  /** Passed from the dashboard for future personalization (e.g. greeting). */
  userDisplayName: string;
  availableModels?: string[];
  defaultModelId?: string;
  initialThreads?: ThreadSidebarThread[];
}) {
  void userDisplayName;
  const t = useTranslations("AiChatCard");
  const tThreads = useTranslations("AiThreads");
  const desktopThreadsPreference = parseDesktopThreadsPreferenceSnapshot(
    useSyncExternalStore(
      subscribeDesktopThreadsPreference,
      getDesktopThreadsPreferenceSnapshot,
      getServerDesktopThreadsPreferenceSnapshot,
    ),
  );
  const [chatSessionId, setChatSessionId] = useState(() => crypto.randomUUID());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [threadRefreshSignal, setThreadRefreshSignal] = useState(0);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const [mobileThreadsOpen, setMobileThreadsOpen] = useState(false);
  const [desktopMeasuredHeight, setDesktopMeasuredHeight] = useState<number | null>(null);
  const threadSwitchAbortRef = useRef<AbortController | null>(null);
  const chatCardRef = useRef<HTMLDivElement | null>(null);
  const desktopThreadsCollapsed = desktopThreadsPreference.collapsed;

  const [selectedModelId, setSelectedModelId] = useState<string | undefined>();
  const activeProviderName = getAiProviderNameForModel(
    selectedModelId || defaultModelId,
    providerName,
  );

  const validateFilesForProvider = useCallback(
    (files: File[], activeProviderName: AttachmentProviderName) => {
      if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
        return t("errors.maxAttachments", { max: MAX_ATTACHMENTS_PER_MESSAGE });
      }
      let totalEncodedChars = 0;
      for (const file of files) {
        const mimeType = resolveMimeType(file);
        if (
          !SUPPORTED_IMAGE_MIME_TYPES.has(mimeType) &&
          !isSupportedFileMimeType(mimeType, activeProviderName)
        ) {
          return t("errors.unsupportedType", { mimeType: mimeType || file.name || "unknown" });
        }
        if (
          isSupportedFileMimeType(mimeType, activeProviderName) &&
          providerSupportsUploadedFileReferences(activeProviderName)
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
    [t],
  );

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
      const explicitRequestedModelId =
        typeof body?.modelId === "string" && body.modelId.trim().length > 0
          ? body.modelId.trim()
          : selectedModelId;
      const requestProviderName = getAiProviderNameForModel(
        explicitRequestedModelId || defaultModelId,
        providerName,
      );
      return {
        ...request,
        body: {
          ...body,
          messages: toApiChatMessages(messages, requestProviderName),
          sessionId: chatSessionId,
          ...(activeThreadId ? { threadId: activeThreadId } : {}),
          ...(explicitRequestedModelId ? { modelId: explicitRequestedModelId } : {}),
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
  }, [toolsEnabled, activeThreadId, providerName, chatSessionId, selectedModelId, defaultModelId]);

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

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(min-width: 1024px)")
        : ({
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {},
          } as Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener">);
    let animationFrameId = 0;

    const measure = () => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(() => {
        const card = chatCardRef.current;
        if (!card || !mediaQuery.matches) {
          setDesktopMeasuredHeight(null);
          return;
        }

        const top = card.getBoundingClientRect().top;
        const availableHeight = Math.floor(window.innerHeight - top - DESKTOP_CHAT_BOTTOM_GAP_PX);
        const nextHeight = Math.max(0, Math.min(DESKTOP_CHAT_MAX_HEIGHT_PX, availableHeight));

        setDesktopMeasuredHeight((currentHeight) =>
          currentHeight === nextHeight ? currentHeight : nextHeight,
        );
      });
    };

    measure();
    window.addEventListener("resize", measure);
    mediaQuery.addEventListener("change", measure);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", measure);
      mediaQuery.removeEventListener("change", measure);
    };
  }, [desktopThreadsCollapsed]);

  const setDesktopThreadsCollapsedPersisted = useCallback((collapsed: boolean) => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(DESKTOP_RECENTS_STORAGE_KEY, collapsed ? "true" : "false");
      desktopThreadsManualFallback = null;
    } catch {
      // Ignore localStorage issues and still honor the in-memory toggle.
      desktopThreadsManualFallback = collapsed;
    }

    window.dispatchEvent(new Event(DESKTOP_RECENTS_PREFERENCE_EVENT));
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
      return validateFilesForProvider(files, activeProviderName);
    },
    [activeProviderName, validateFilesForProvider],
  );

  async function handleSubmit(text: string, files: File[], modelId?: string) {
    const explicitModelId = modelId?.trim() || undefined;
    setSelectedModelId(explicitModelId);
    clearError();
    setUploadErrorMessage(null);
    const targetProviderName = getAiProviderNameForModel(
      explicitModelId || defaultModelId,
      providerName,
    );
    const validationError = validateFilesForProvider(files, targetProviderName);
    if (validationError) {
      setUploadErrorMessage(validationError);
      return;
    }
    try {
      const fileParts = await Promise.all(
        files.map((file) => {
          const mimeType = resolveMimeType(file);
          if (
            isSupportedFileMimeType(mimeType, targetProviderName) &&
            providerSupportsUploadedFileReferences(targetProviderName)
          ) {
            return providerFileToUiPart(file, targetProviderName);
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
        explicitModelId ? { body: { modelId: explicitModelId } } : undefined,
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

  const showRecentsLabel = tThreads("actions.showRecents");
  const hideRecentsLabel = tThreads("actions.hideRecents");
  const newThreadLabel = tThreads("actions.newThread");

  return (
    <div
      ref={chatCardRef}
      className="flex min-h-[32rem] flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border lg:min-h-0 lg:flex-row"
      style={desktopMeasuredHeight !== null ? { height: `${desktopMeasuredHeight}px` } : undefined}
    >
      {!desktopThreadsCollapsed ? (
        <div className="hidden lg:flex lg:min-h-0 lg:w-[260px] lg:shrink-0 lg:self-stretch lg:overflow-hidden">
          <ThreadSidebar
            activeThreadId={activeThreadId}
            onSelectThread={handleSelectThread}
            onNewThread={handleNewThread}
            refreshSignal={threadRefreshSignal}
            initialThreads={initialThreads}
            headerLeading={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setDesktopThreadsCollapsedPersisted(true)}
                className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                title={hideRecentsLabel}
                aria-label={hideRecentsLabel}
              >
                <ChevronLeft className="size-4" />
              </Button>
            }
          />
        </div>
      ) : null}

      <Sheet open={mobileThreadsOpen} onOpenChange={setMobileThreadsOpen}>
        <SheetContent side="left" className="p-0 lg:hidden">
          <SheetHeader className="border-b border-border/70 pb-4">
            <SheetTitle>{tThreads("title")}</SheetTitle>
          </SheetHeader>
          <div className="flex h-full min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <ThreadSidebar
              activeThreadId={activeThreadId}
              onSelectThread={(threadId) => {
                setMobileThreadsOpen(false);
                void handleSelectThread(threadId);
              }}
              onNewThread={() => {
                setMobileThreadsOpen(false);
                handleNewThread();
              }}
              refreshSignal={threadRefreshSignal}
              initialThreads={initialThreads}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          "relative flex min-w-0 flex-1 flex-col overflow-hidden before:hidden",
          !desktopThreadsCollapsed &&
            "lg:before:absolute lg:before:inset-y-4 lg:before:left-0 lg:before:block lg:before:w-px lg:before:bg-border/40",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-0 px-3 py-3 sm:px-5 sm:py-4 lg:px-8">
          {desktopThreadsCollapsed ? (
            <div className="mb-3 hidden lg:flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                onClick={() => setDesktopThreadsCollapsedPersisted(false)}
                title={showRecentsLabel}
                aria-label={showRecentsLabel}
              >
                <ChevronRight className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                onClick={handleNewThread}
                title={newThreadLabel}
                aria-label={newThreadLabel}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          ) : null}
          <div className="mb-3 lg:hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full px-3"
              onClick={() => setMobileThreadsOpen(true)}
            >
              <PanelLeft className="size-4" />
              {tThreads("recents")}
            </Button>
          </div>
          <div
            className={cn(
              "mx-auto flex min-h-0 w-full flex-1 flex-col",
              CHAT_COLUMN_MAX_WIDTH_CLASS,
            )}
          >
            <Conversation>
              {messages.length === 0 ? (
                <div
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-4 px-4 py-12",
                    "text-center",
                  )}
                >
                  <h2 className="text-2xl font-medium text-foreground">
                    {t("emptyConversationHeading")}
                  </h2>
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

        <div
          className="px-3 py-3 sm:px-5 sm:py-4 lg:px-8"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className={cn("mx-auto w-full", CHAT_COLUMN_MAX_WIDTH_CLASS)}>
            <PromptInput
              onSubmit={(text, files, modelId) => void handleSubmit(text, files, modelId)}
              isSending={isSending}
              onStop={() => void stop()}
              providerName={activeProviderName}
              validateFiles={validateFiles}
              availableModels={availableModels}
              selectedModelId={selectedModelId}
              onModelChange={setSelectedModelId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
