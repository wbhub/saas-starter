"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Paperclip, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type AttachmentProviderName, getSupportedAttachmentAccept } from "@/lib/ai/attachments";
import { cn } from "@/lib/utils";

const MAX_ATTACHMENTS_PER_MESSAGE = 8;

export function PromptInput({
  onSubmit,
  isSending,
  providerName,
  validateFiles,
}: {
  onSubmit: (text: string, files: File[]) => void;
  isSending: boolean;
  providerName: AttachmentProviderName;
  validateFiles: (files: File[]) => string | null;
}) {
  const t = useTranslations("AiChatCard");
  const [input, setInput] = useState("");
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    setInput("");
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onSubmit(draftInput, draftFiles);
  }

  return (
    <>
      {validationMessage ? (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          {validationMessage}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div
          className={cn(
            "rounded-2xl border border-border/70 bg-background/90 p-1 shadow-sm ring-1 ring-black/[0.04] dark:bg-background/80 dark:ring-white/[0.06]",
            "focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/20",
          )}
        >
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={3}
            placeholder={t("placeholder")}
            disabled={isSending}
            className="min-h-[88px] resize-none border-0 bg-transparent px-3 py-2.5 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 md:min-h-[96px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-[13px] border-t border-border/50 bg-muted/35 px-2.5 py-2.5 dark:bg-muted/25">
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
                variant="outline"
                disabled={isSending}
                className="h-10 min-h-10 shrink-0 gap-1.5 border-dashed border-border/90 bg-background/80 px-3 text-muted-foreground hover:border-solid hover:border-border hover:bg-muted/50 hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t("attachments.label")}
              >
                <Paperclip className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">{t("attachments.label")}</span>
              </Button>
              {pendingFiles.length > 0 ? (
                <span className="truncate rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {t("attachments.selected", { count: pendingFiles.length })}
                </span>
              ) : null}
            </div>
            <Button
              type="submit"
              variant="default"
              disabled={isSending || (input.trim().length === 0 && pendingFiles.length === 0)}
              className="h-10 min-h-10 min-w-[7.5rem] shrink-0 gap-2 px-5 shadow-sm hover:bg-primary/90"
            >
              {isSending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t("actions.sending")}
                </>
              ) : (
                <>
                  <SendHorizontal className="size-4" aria-hidden />
                  {t("actions.send")}
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
