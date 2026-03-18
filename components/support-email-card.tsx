"use client";

import { FormEvent, useState } from "react";

type ApiError = {
  error?: string;
};

export function SupportEmailCard() {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | ApiError
          | null;
        throw new Error(payload?.error ?? "Failed to send support email.");
      }

      setMessage("");
      setSubject("");
      setFeedback("Message sent. We will follow up shortly.");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Failed to send support email.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
        Email support (Resend)
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Send a message directly to your support inbox using Resend.
      </p>

      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
            Subject (optional)
          </span>
          <input
            type="text"
            maxLength={120}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-slate-900 outline-none ring-[color:var(--ring)] placeholder:text-slate-500 focus:ring-2 dark:text-slate-50 dark:placeholder:text-slate-400"
            placeholder="Billing question"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
            Message
          </span>
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-slate-900 outline-none ring-[color:var(--ring)] placeholder:text-slate-500 focus:ring-2 dark:text-slate-50 dark:placeholder:text-slate-400"
            placeholder="Tell us what you need help with..."
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {submitting ? "Sending..." : "Send support email"}
        </button>
      </form>

      {feedback ? (
        <p className="mt-3 rounded-lg app-surface-subtle px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
