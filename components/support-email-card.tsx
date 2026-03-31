"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { DashboardPageSection } from "@/components/dashboard-page-section";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const [feedbackStatus, setFeedbackStatus] = useState<"success" | "error">("success");

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
      setFeedbackStatus("success");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("errors.sendFailed"));
      setFeedbackStatus("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardPageSection icon={Mail} title={t("title")} description={t("description")}>
      <div className="space-y-4">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <Label className="mb-1">{t("fields.subject")}</Label>
            <Input
              type="text"
              maxLength={120}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={t("fields.subjectPlaceholder")}
            />
          </div>

          <div>
            <Label className="mb-1">{t("fields.message")}</Label>
            <Textarea
              required
              minLength={10}
              maxLength={2000}
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t("fields.messagePlaceholder")}
            />
          </div>

          <SubmitButton
            loading={submitting}
            pendingLabel={t("actions.sending")}
            idleLabel={t("actions.sendSupportEmail")}
          />
        </form>

        <FormMessage status={feedbackStatus} message={feedback} />
      </div>
    </DashboardPageSection>
  );
}
