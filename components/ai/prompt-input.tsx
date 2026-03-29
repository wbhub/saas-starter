"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  type AttachmentProviderName,
  getSupportedAttachmentAccept,
} from "@/lib/ai/attachments";

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
    if (!value || isSending) return;

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
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          {validationMessage}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} className="mt-4 space-y-2">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={4}
          placeholder={t("placeholder")}
          disabled={isSending}
        />
        <div className="space-y-2">
          <Label className="text-muted-foreground">{t("attachments.label")}</Label>
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
          <Button
            type="submit"
            disabled={isSending || input.trim().length === 0}
            className="h-auto bg-indigo-500 px-4 py-2 text-white hover:bg-indigo-400"
          >
            {isSending ? t("actions.sending") : t("actions.send")}
          </Button>
        </div>
      </form>
    </>
  );
}
