"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { type AttachmentProviderName, getSupportedAttachmentAccept } from "@/lib/ai/attachments";
import { cn } from "@/lib/utils";

const MAX_ATTACHMENTS_PER_MESSAGE = 8;

export function PromptInput({
  onSubmit,
  isSending,
  onStop,
  providerName,
  validateFiles,
  availableModels = [],
}: {
  onSubmit: (text: string, files: File[], modelId?: string) => void;
  isSending: boolean;
  onStop: () => void;
  providerName: AttachmentProviderName;
  validateFiles: (files: File[]) => string | null;
  availableModels?: string[];
}) {
  const t = useTranslations("AiChatCard");
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supportedAttachmentAccept = getSupportedAttachmentAccept(providerName);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      setValidationMessage(t("errors.maxAttachments", { max: MAX_ATTACHMENTS_PER_MESSAGE }));
      setPendingFiles([]);
      event.currentTarget.value = "";
      return;
    }
    const validationError = validateFiles(files);
    setValidationMessage(validationError);
    if (validationError) {
      setPendingFiles([]);
      event.currentTarget.value = "";
      return;
    }
    setPendingFiles(files);
  }

  function submitMessage() {
    const value = input.trim();
    const validationError = validateFiles(pendingFiles);
    if (validationError) {
      setValidationMessage(validationError);
      return;
    }
    if ((value.length === 0 && pendingFiles.length === 0) || isSending) return;

    setValidationMessage(null);
    const draftInput = value;
    const draftFiles = [...pendingFiles];
    const draftModel = selectedModel;
    setInput("");
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onSubmit(draftInput, draftFiles, draftModel || undefined);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitMessage();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      submitMessage();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      const target = event.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = input.substring(0, start) + "\n" + input.substring(end);
      setInput(newValue);

      requestAnimationFrame(() => {
        target.selectionStart = start + 1;
        target.selectionEnd = start + 1;
      });
    }
  }

  return (
    <>
      {validationMessage ? (
        <p className="mb-3 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-sm text-warning-foreground dark:text-warning">
          {validationMessage}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div
          className={cn(
            "rounded-2xl bg-muted/20 p-2 shadow-sm ring-1 ring-border",
            "focus-within:ring-2 focus-within:ring-primary/20",
          )}
        >
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={t("placeholder")}
            disabled={isSending}
            className="min-h-[44px] resize-none border-0 bg-transparent px-3 py-2.5 text-sm font-normal leading-relaxed text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0 md:min-h-[44px] md:text-sm"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                disabled={isSending}
                onChange={handleFileChange}
                accept={supportedAttachmentAccept}
                className="sr-only"
                id="ai-chat-attachments-input"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={isSending}
                className="h-9 w-9 shrink-0 cursor-pointer rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t("attachments.label")}
              >
                <Paperclip className="size-4" aria-hidden />
              </Button>
              {availableModels.length > 1 ? (
                <Select
                  value={selectedModel || "auto"}
                  onValueChange={(value) => setSelectedModel(value === "auto" ? "" : value || "")}
                  disabled={isSending}
                >
                  <SelectTrigger
                    size="sm"
                    className={cn(
                      "h-8 rounded-full border-0 bg-transparent px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-none",
                      "hover:bg-muted/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20",
                      "data-[popup-open]:bg-muted/50 data-[popup-open]:text-foreground",
                    )}
                  >
                    <span data-slot="select-value" className="flex flex-1 text-left">
                      {selectedModel ? selectedModel.toUpperCase() : "Auto"}
                    </span>
                  </SelectTrigger>
                  <SelectContent align="start" sideOffset={4}>
                    <SelectItem value="auto">Auto</SelectItem>
                    {availableModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {pendingFiles.length > 0 ? (
                <span className="truncate rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {t("attachments.selected", { count: pendingFiles.length })}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {isSending ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={onStop}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-full shadow-sm hover:bg-muted"
                  title={t("actions.stop")}
                  aria-label={t("actions.stop")}
                >
                  <span className="inline-block h-3 w-3 rounded-[2px] bg-foreground/70" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="default"
                  size="icon"
                  disabled={input.trim().length === 0 && pendingFiles.length === 0}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-full border border-primary/15 bg-primary/78 text-primary-foreground shadow-sm hover:bg-primary/68 disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground"
                  aria-label={t("actions.send")}
                >
                  <ArrowUp
                    className="size-[18px] stroke-[2.5]"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  />
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
