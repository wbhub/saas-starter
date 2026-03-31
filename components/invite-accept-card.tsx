"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { Button } from "@/components/ui/button";

type AcceptInviteResponse = {
  ok?: boolean;
  error?: string;
  teamName?: string;
  warning?: string;
};

export function InviteAcceptCard({ token }: { token: string }) {
  const t = useTranslations("InviteAcceptCard");
  const tNotFound = useTranslations("NotFound");
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [variant, setVariant] = useState<"success" | "error">("error");
  const [inviteAccepted, setInviteAccepted] = useState(false);

  async function acceptInvite() {
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/team/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json().catch(() => null)) as AcceptInviteResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.unableToAccept"));
      }

      const joinedMessage = t("messages.joined", {
        teamName: payload?.teamName ?? t("messages.defaultTeamName"),
      });

      setInviteAccepted(true);
      setVariant("success");
      setMessage(payload?.warning ? [joinedMessage, payload.warning].join(" ") : joinedMessage);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1500);
    } catch (error) {
      setVariant("error");
      setMessage(error instanceof Error ? error.message : t("errors.unableToAccept"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-lg rounded-xl border app-border-subtle app-surface p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>

      {inviteAccepted ? (
        <Button render={<Link href="/dashboard" />} variant="default" className="mt-5">
          {tNotFound("goDashboard")}
        </Button>
      ) : (
        <Button
          type="button"
          variant="default"
          onClick={acceptInvite}
          disabled={submitting}
          className="mt-5"
        >
          {submitting ? t("actions.accepting") : t("actions.acceptInvite")}
        </Button>
      )}

      {message ? (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            variant === "success"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "app-surface-subtle text-muted-foreground"
          }`}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
