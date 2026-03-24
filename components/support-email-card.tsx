"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";

type ApiError = {
  error?: string;
};

export function SupportEmailCard() {
  const t = useTranslations("SupportEmailCard");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/resend/support", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ subject, message }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiError | null;
        throw new Error(payload?.error ?? t("errors.sendFailed"));
      }

      setMessage("");
      setSubject("");
      setFeedback(t("feedback.sent"));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("errors.sendFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>

      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            {t("fields.subject")}
          </span>
          <Input
            type="text"
            maxLength={120}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder={t("fields.subjectPlaceholder")}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            {t("fields.message")}
          </span>
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
            placeholder={t("fields.messagePlaceholder")}
          />
        </label>

        <SubmitButton
          loading={submitting}
          pendingLabel={t("actions.sending")}
          idleLabel={t("actions.sendSupportEmail")}
        />
      </form>

      <FormMessage status="success" message={feedback} />
    </section>
  );
}
