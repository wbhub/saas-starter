"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getCsrfHeaders } from "@/lib/http/csrf";

type RecoverResponse = {
  ok?: boolean;
  error?: string;
};

export function NoTeamCard() {
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
        throw new Error(payload?.error ?? "Failed to recover team.");
      }

      setMessage("Personal team recovered.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to recover team.");
    } finally {
      setRecovering(false);
    }
  }

  return (
    <section className="mx-auto mt-16 max-w-xl rounded-xl border app-border-subtle app-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
        No team access found
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        You do not currently belong to an active team. Recover a personal team to continue.
      </p>
      <button
        type="button"
        onClick={recoverTeam}
        disabled={recovering}
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {recovering ? "Recovering..." : "Recover personal team"}
      </button>
      {message ? (
        <p className="mt-3 rounded-lg app-surface-subtle px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
          {message}
        </p>
      ) : null}
    </section>
  );
}
