"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { getCsrfHeaders } from "@/lib/http/csrf";

type ApiResponse = {
  message?: string;
  error?: string;
};

export function ForgotPasswordForm() {
  const t = useTranslations("ForgotPasswordForm");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"error" | "success">("success");
  const messageId = "forgot-password-message";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ApiResponse
        | null;

      if (!response.ok) {
        setMessageType("error");
        throw new Error(payload?.error ?? t("errors.unableToSendResetLink"));
      }

      setMessageType("success");
      setMessage(
        payload?.message ??
          t("messages.resetLinkSentIfAccountExists"),
      );
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : t("errors.unexpected"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border app-border-subtle app-surface p-8 text-[color:var(--foreground)] shadow-sm">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
        {t("description")}
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit} aria-busy={loading}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[color:var(--foreground)]">
            {t("email")}
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={message ? messageId : undefined}
            aria-invalid={messageType === "error" && Boolean(message)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-[color:var(--foreground)] outline-none ring-[color:var(--ring)] placeholder:text-[color:var(--muted-foreground)] focus:ring-2"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-btn-accent px-4 py-2 font-medium text-white hover:bg-btn-accent-hover disabled:opacity-60"
        >
          {loading ? t("sending") : t("sendResetLink")}
        </button>
      </form>

      {message ? (
        <p
          id={messageId}
          role={messageType === "error" ? "alert" : "status"}
          aria-live={messageType === "error" ? "assertive" : "polite"}
          className="mt-4 rounded-lg app-surface-subtle px-3 py-2 text-sm text-[color:var(--foreground)]"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
