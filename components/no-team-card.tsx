"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { Button } from "@/components/ui/button";

type RecoverResponse = {
  ok?: boolean;
  error?: string;
};

export function NoTeamCard() {
  const t = useTranslations("NoTeamCard");
  const router = useRouter();
  const [recovering, setRecovering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function recoverTeam() {
    setRecovering(true);
    setMessage(null);

    try {
      const response = await fetch("/api/team/recover-personal", {
        method: "POST",
        headers: getCsrfHeaders(),
      });
      const payload = (await response.json().catch(() => null)) as RecoverResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.recoverFailed"));
      }

      setMessage(t("messages.recovered"));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.recoverFailed"));
    } finally {
      setRecovering(false);
    }
  }

  return (
    <section className="mx-auto mt-16 max-w-xl rounded-xl border app-border-subtle app-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>
      <Button type="button" variant="default" onClick={recoverTeam} disabled={recovering} className="mt-4">
        {recovering ? t("actions.recovering") : t("actions.recover")}
      </Button>
      {message ? (
        <p className="mt-3 rounded-lg app-surface-subtle px-3 py-2 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </section>
  );
}
