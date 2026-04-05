"use client";

import { type UIMessage } from "ai";
import { isToolUIPart, getToolName } from "ai";
import { MarkdownContent } from "./markdown-content";
import { ReasoningDisplay } from "./reasoning-display";
import { SourceCitation } from "./source-citation";
import { ToolGroupCard, type ToolCallItem } from "./tool-card";
import { AttachmentPreview } from "./attachment-preview";
import { MessageMetadata } from "./message-metadata";

type MessageMetadataType = {
  model?: string;
  timestamp?: string;
  promptTokens?: number;
  completionTokens?: number;
  toolCalls?: string[];
  durationMs?: number;
  threadId?: string;
};

export function MessageBubble({
  message,
  isStreaming,
}: {
  message: UIMessage;
  isStreaming?: boolean;
}) {
  const isUser = message.role === "user";
  const metadata = (message.metadata ?? {}) as MessageMetadataType;
  const toolCalls: ToolCallItem[] = message.parts
    .filter((part) => isToolUIPart(part))
    .map((part) => ({
      toolName: getToolName(part),
      args: part.input,
      result: part.state === "output-available" ? part.output : undefined,
      state: part.state,
    }));
  const firstToolPartIndex = message.parts.findIndex((part) => isToolUIPart(part));
  const stepCount = message.parts.filter((part) => part.type === "step-start").length;
  const hasAssistantNarrativeContent = message.parts.some(
    (part) =>
      (part.type === "text" && part.text.length > 0) ||
      part.type === "reasoning" ||
      part.type === "source-url" ||
      part.type === "source-document",
  );

  const hasContent = message.parts.some(
    (part) =>
      (part.type === "text" && part.text.length > 0) ||
      part.type === "reasoning" ||
      part.type === "source-url" ||
      part.type === "source-document" ||
      part.type === "file" ||
      isToolUIPart(part),
  );
  if (!hasContent) return null;

  // Collect file parts for attachment preview
  const fileAttachments = message.parts
    .filter((part) => part.type === "file")
    .map((part) => ({
      mediaType: (part as { mediaType?: string }).mediaType,
      filename: (part as { filename?: string }).filename,
      url: (part as { url?: string }).url,
    }));

  // Collect source parts (source-url and source-document)
  const sourceParts = message.parts
    .filter((part) => part.type === "source-url" || part.type === "source-document")
    .map((part) => {
      if (part.type === "source-url") {
        return {
          title: part.title,
          url: part.url,
        };
      }
      // source-document
      return {
        title: (part as { title?: string }).title,
        url: undefined,
      };
    });

  return (
    <div className="space-y-2">
      {fileAttachments.length > 0 && isUser ? (
        <div className="ml-auto max-w-[88%]">
          <AttachmentPreview attachments={fileAttachments} />
        </div>
      ) : null}

      {message.parts.map((part, partIndex) => {
        if (part.type === "text" && part.text.length > 0) {
          if (isUser) {
            return (
              <div
                key={partIndex}
                className="ml-auto w-fit max-w-[88%] rounded-lg bg-primary/78 px-3 py-2 text-sm font-normal leading-relaxed text-primary-foreground"
              >
                {part.text}
              </div>
            );
          }

          const isStreamingTextPart = isStreaming && partIndex === message.parts.length - 1;

          return (
            <div
              key={partIndex}
              className="max-w-[88%] rounded-lg bg-card px-3 py-2 text-sm font-normal leading-relaxed text-foreground"
            >
              <div className="break-words">
                <MarkdownContent content={part.text} />
              </div>
              {isStreamingTextPart ? (
                <span className="inline-block h-4 w-0.5 animate-pulse bg-foreground" />
              ) : null}
            </div>
          );
        }

        if (part.type === "step-start") {
          return null;
        }

        if (part.type === "reasoning") {
          return (
            <div key={partIndex} className="max-w-[88%]">
              <ReasoningDisplay
                reasoning={part.text}
                isStreaming={isStreaming && partIndex === message.parts.length - 1}
              />
            </div>
          );
        }

        if (isToolUIPart(part)) {
          if (partIndex !== firstToolPartIndex) {
            return null;
          }

          return <ToolGroupCard key={partIndex} calls={toolCalls} stepCount={stepCount} />;
        }

        return null;
      })}

      {sourceParts.length > 0 ? (
        <div className="max-w-[88%]">
          <SourceCitation sources={sourceParts} />
        </div>
      ) : null}

      {!isUser && !isStreaming && toolCalls.length > 0 && !hasAssistantNarrativeContent ? (
        <div className="max-w-[88%] rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-sm text-warning-foreground dark:text-warning">
          The agent finished its tool work but did not produce a written summary. Expand the AI
          Agent dropdown to inspect the actions, or retry with a narrower request.
        </div>
      ) : null}

      {!isUser && !isStreaming ? (
        <div className="max-w-[88%]">
          <MessageMetadata
            model={metadata.model}
            timestamp={metadata.timestamp}
            promptTokens={metadata.promptTokens}
            completionTokens={metadata.completionTokens}
            toolCallCount={metadata.toolCalls?.length}
            durationMs={metadata.durationMs}
          />
        </div>
      ) : null}
    </div>
  );
}
