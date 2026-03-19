"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getCsrfHeaders } from "@/lib/http/csrf";

type AcceptInviteResponse = {
  ok?: boolean;
  error?: string;
  teamName?: string;
};

export function InviteAcceptCard({
  token,
  isAuthenticated,
}: {
  token: string;
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function acceptInvite() {
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/team/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json().catch(() => null)) as
        | AcceptInviteResponse
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to accept invite.");
      }

      setMessage(`Joined ${payload?.teamName ?? "team"} successfully.`);
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to accept invite.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-lg rounded-xl border app-border-subtle app-surface p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Team invite
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Accept this invite to join the shared workspace.
      </p>

      {!isAuthenticated ? (
        <p className="mt-4 rounded-lg app-surface-subtle px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
          Log in first, then return to this page to accept the invite.
        </p>
      ) : (
        <button
          type="button"
          onClick={acceptInvite}
          disabled={submitting}
          className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {submitting ? "Accepting..." : "Accept invite"}
        </button>
      )}

      {message ? (
        <p className="mt-4 rounded-lg app-surface-subtle px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
          {message}
        </p>
      ) : null}
    </section>
  );
}
