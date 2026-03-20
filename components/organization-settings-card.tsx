"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCsrfHeaders } from "@/lib/http/csrf";

type TeamMember = {
  userId: string;
  fullName: string | null;
  role: "owner" | "admin" | "member";
};

type OrganizationSettingsCardProps = {
  teamName: string;
  members: TeamMember[];
  currentUserId: string;
  currentUserRole: "owner" | "admin" | "member";
};

export function OrganizationSettingsCard({
  teamName,
  members,
  currentUserId,
  currentUserRole,
}: OrganizationSettingsCardProps) {
  const router = useRouter();
  const [nameValue, setNameValue] = useState(teamName);
  const [savingName, setSavingName] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [nextOwnerUserId, setNextOwnerUserId] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ownershipCandidates = useMemo(
    () =>
      members.filter(
        (member) => member.userId !== currentUserId && member.role !== "owner",
      ),
    [members, currentUserId],
  );

  async function saveTeamName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingName(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch("/api/team/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getCsrfHeaders(),
        },
        body: JSON.stringify({ teamName: nameValue }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; ok?: boolean }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to update team name.");
      }
      setFeedback("Organization name updated.");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Failed to update team name.",
      );
    } finally {
      setSavingName(false);
    }
  }

  async function transferOwnership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nextOwnerUserId) {
      setError("Select a teammate to transfer ownership.");
      return;
    }
    const confirmed = window.confirm(
      "Transfer ownership? You will become an admin after this action.",
    );
    if (!confirmed) {
      return;
    }

    setTransferring(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch("/api/team/ownership/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getCsrfHeaders(),
        },
        body: JSON.stringify({ nextOwnerUserId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; ok?: boolean }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to transfer ownership.");
      }
      setFeedback("Ownership transferred.");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Failed to transfer ownership.",
      );
    } finally {
      setTransferring(false);
    }
  }

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
        Organization settings
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Rename your workspace and transfer ownership when needed.
      </p>

      <form className="mt-4 space-y-3" onSubmit={saveTeamName}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
            Team name
          </span>
          <input
            type="text"
            value={nameValue}
            onChange={(event) => setNameValue(event.target.value)}
            maxLength={80}
            minLength={2}
            disabled={currentUserRole === "member" || savingName}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-slate-900 outline-none ring-[color:var(--ring)] focus:ring-2 disabled:opacity-60 dark:text-slate-50"
          />
        </label>
        <button
          type="submit"
          disabled={currentUserRole === "member" || savingName}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {savingName ? "Saving..." : "Save organization"}
        </button>
      </form>

      {currentUserRole === "owner" ? (
        <form className="mt-6 space-y-3 border-t app-border-subtle pt-5" onSubmit={transferOwnership}>
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Transfer ownership
          </h3>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700 dark:text-slate-200">
              New owner
            </span>
            <select
              value={nextOwnerUserId}
              onChange={(event) => setNextOwnerUserId(event.target.value)}
              disabled={transferring || ownershipCandidates.length === 0}
              className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-slate-900 outline-none ring-[color:var(--ring)] focus:ring-2 disabled:opacity-60 dark:text-slate-50"
            >
              <option value="">Select teammate...</option>
              {ownershipCandidates.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {(member.fullName?.trim() || member.userId) + ` (${member.role})`}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={transferring || !nextOwnerUserId}
            className="rounded-lg border border-amber-300/60 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-700/60 dark:text-amber-200 dark:hover:bg-amber-950/30"
          >
            {transferring ? "Transferring..." : "Transfer ownership"}
          </button>
        </form>
      ) : null}

      {feedback ? (
        <p className="mt-3 rounded-lg app-surface-subtle px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-rose-300/60 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </p>
      ) : null}
    </section>
  );
}
