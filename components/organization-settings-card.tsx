"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("OrganizationSettingsCard");
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
        throw new Error(payload?.error ?? t("errors.updateName"));
      }
      setFeedback(t("feedback.nameUpdated"));
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : t("errors.updateName"),
      );
    } finally {
      setSavingName(false);
    }
  }

  async function transferOwnership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nextOwnerUserId) {
      setError(t("errors.selectTeammate"));
      return;
    }
    const confirmed = window.confirm(
      t("confirm.transferOwnership"),
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
        throw new Error(payload?.error ?? t("errors.transferOwnership"));
      }
      setFeedback(t("feedback.ownershipTransferred"));
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : t("errors.transferOwnership"),
      );
    } finally {
      setTransferring(false);
    }
  }

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">
        {t("title")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("description")}
      </p>

      <form className="mt-4 space-y-3" onSubmit={saveTeamName}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            {t("fields.teamName")}
          </span>
          <input
            type="text"
            value={nameValue}
            onChange={(event) => setNameValue(event.target.value)}
            maxLength={80}
            minLength={2}
            disabled={currentUserRole === "member" || savingName}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2 disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled={currentUserRole === "member" || savingName}
          className="rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-text hover:bg-btn-primary-hover disabled:opacity-60"
        >
          {savingName ? t("actions.saving") : t("actions.saveOrganization")}
        </button>
      </form>

      {currentUserRole === "owner" ? (
        <form className="mt-6 space-y-3 border-t app-border-subtle pt-5" onSubmit={transferOwnership}>
          <h3 className="text-sm font-medium text-foreground">
            {t("ownership.title")}
          </h3>
          <label className="block">
            <span className="mb-1 block text-sm text-muted-foreground">
              {t("ownership.newOwner")}
            </span>
            <select
              value={nextOwnerUserId}
              onChange={(event) => setNextOwnerUserId(event.target.value)}
              disabled={transferring || ownershipCandidates.length === 0}
              className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2 disabled:opacity-60"
            >
              <option value="">{t("ownership.selectTeammate")}</option>
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
            {transferring ? t("actions.transferring") : t("actions.transferOwnership")}
          </button>
        </form>
      ) : null}

      {feedback ? (
        <p className="mt-3 rounded-lg app-surface-subtle px-3 py-2 text-sm text-muted-foreground">
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
