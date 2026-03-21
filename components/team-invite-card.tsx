"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { formatUtcDate } from "@/lib/date";
import { type AppLocale } from "@/i18n/routing";

type TeamMember = {
  userId: string;
  fullName: string | null;
  role: "owner" | "admin" | "member";
};

type PendingInvite = {
  id: string;
  email: string;
  role: "admin" | "member";
  expiresAt: string;
};

type InviteApiResponse = {
  ok?: boolean;
  error?: string;
  emailSent?: boolean;
};

type TeamMutationResponse = {
  ok?: boolean;
  error?: string;
  emailSent?: boolean;
};

export function TeamInviteCard({
  canInvite,
  teamName,
  members,
  pendingInvites,
  currentUserId,
  currentUserRole,
}: {
  canInvite: boolean;
  teamName: string;
  members: TeamMember[];
  pendingInvites: PendingInvite[];
  currentUserId: string;
  currentUserRole: "owner" | "admin" | "member";
}) {
  const t = useTranslations("TeamInviteCard");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [submitting, setSubmitting] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
  const [revokeInviteId, setRevokeInviteId] = useState<string | null>(null);
  const [resendInviteId, setResendInviteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  function getRoleLabel(value: "owner" | "admin" | "member") {
    if (value === "owner") return t("roles.owner");
    if (value === "admin") return t("roles.admin");
    return t("roles.member");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canInvite) {
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ email, role }),
      });
      const payload = (await response.json().catch(() => null)) as InviteApiResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.sendInvite"));
      }

      setEmail("");
      setRole("member");
      setFeedback(
        payload?.emailSent
          ? t("feedback.inviteEmailSent")
          : t("feedback.inviteCreatedEmailFailed"),
      );
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("errors.sendInvite"));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeMember(targetUserId: string) {
    const confirmed = window.confirm(
      t("confirmations.removeMember"),
    );
    if (!confirmed) {
      return;
    }

    setRemovingUserId(targetUserId);
    setFeedback(null);

    try {
      const response = await fetch(`/api/team/members/${targetUserId}`, {
        method: "DELETE",
        headers: getCsrfHeaders(),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; ok?: boolean }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.removeMember"));
      }

      setFeedback(t("feedback.memberRemoved"));
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("errors.removeMember"));
    } finally {
      setRemovingUserId(null);
    }
  }

  async function updateMemberRole(targetUserId: string, role: "member" | "admin") {
    setUpdatingRoleUserId(targetUserId);
    setFeedback(null);
    try {
      const response = await fetch(`/api/team/members/${targetUserId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getCsrfHeaders(),
        },
        body: JSON.stringify({ role }),
      });
      const payload = (await response.json().catch(() => null)) as TeamMutationResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.updateRole"));
      }
      setFeedback(t("feedback.roleUpdated"));
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("errors.updateRole"));
    } finally {
      setUpdatingRoleUserId(null);
    }
  }

  async function revokeInvite(inviteId: string) {
    const confirmed = window.confirm(t("confirmations.revokeInvite"));
    if (!confirmed) {
      return;
    }
    setRevokeInviteId(inviteId);
    setFeedback(null);
    try {
      const response = await fetch(`/api/team/invites/${inviteId}`, {
        method: "DELETE",
        headers: getCsrfHeaders(),
      });
      const payload = (await response.json().catch(() => null)) as TeamMutationResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.revokeInvite"));
      }
      setFeedback(t("feedback.inviteRevoked"));
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("errors.revokeInvite"));
    } finally {
      setRevokeInviteId(null);
    }
  }

  async function resendInvite(inviteId: string) {
    setResendInviteId(inviteId);
    setFeedback(null);
    try {
      const response = await fetch(`/api/team/invites/${inviteId}/resend`, {
        method: "POST",
        headers: getCsrfHeaders(),
      });
      const payload = (await response.json().catch(() => null)) as TeamMutationResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.resendInvite"));
      }
      setFeedback(payload?.emailSent ? t("feedback.inviteResent") : t("feedback.inviteResentEmailFailed"));
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("errors.resendInvite"));
    } finally {
      setResendInviteId(null);
    }
  }

  function canRemoveMember(member: TeamMember) {
    if (member.userId === currentUserId) {
      return false;
    }
    if (currentUserRole === "owner") {
      return true;
    }
    if (currentUserRole === "admin") {
      return member.role === "member";
    }
    return false;
  }

  function canManageRole(member: TeamMember) {
    if (member.userId === currentUserId) {
      return false;
    }
    if (member.role === "owner") {
      return false;
    }
    if (currentUserRole === "owner") {
      return true;
    }
    if (currentUserRole === "admin") {
      return member.role === "member";
    }
    return false;
  }

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
        {t("title")}
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {t("description", { teamName })}
      </p>

      <div className="mt-4 space-y-2 text-sm">
        {members.map((member) => (
          <div
            key={`${member.userId}:${member.role}`}
            className="flex items-center justify-between rounded-md app-surface-subtle px-3 py-2"
          >
            <div className="truncate">
              <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                {member.fullName?.trim() || member.userId}
              </p>
              <p className="truncate text-xs text-slate-600 dark:text-slate-300">
                {member.userId}
              </p>
            </div>
            <div className="ml-3 flex items-center gap-2">
              <span className="rounded-full border app-border-subtle px-2 py-0.5 text-xs capitalize text-slate-700 dark:text-slate-200">
                {getRoleLabel(member.role)}
              </span>
              {canManageRole(member) ? (
                <button
                  type="button"
                  disabled={updatingRoleUserId !== null}
                  onClick={() =>
                    updateMemberRole(
                      member.userId,
                      member.role === "admin" ? "member" : "admin",
                    )
                  }
                  className="rounded-md border app-border-subtle px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {updatingRoleUserId === member.userId
                    ? t("actions.saving")
                    : member.role === "admin"
                      ? t("actions.makeMember")
                      : t("actions.makeAdmin")}
                </button>
              ) : null}
            </div>
            {canRemoveMember(member) ? (
              <button
                type="button"
                disabled={removingUserId !== null}
                onClick={() => removeMember(member.userId)}
                className="ml-2 rounded-md border border-rose-300/60 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-700/60 dark:text-rose-200 dark:hover:bg-rose-950/30"
              >
                {removingUserId === member.userId ? t("actions.removing") : t("actions.remove")}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {t("pending.title")}
        </h3>
        {pendingInvites.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t("pending.none")}
          </p>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between rounded-md app-surface-subtle px-3 py-2"
              >
                <div className="truncate">
                  <p className="truncate text-slate-900 dark:text-slate-100">
                    {invite.email}
                  </p>
                  <p className="truncate text-xs text-slate-600 dark:text-slate-300">
                    {t("pending.expires", { date: formatUtcDate(invite.expiresAt, undefined, locale) })}
                  </p>
                </div>
                <div className="ml-3 flex items-center gap-2">
                  <span className="rounded-full border app-border-subtle px-2 py-0.5 text-xs capitalize text-slate-700 dark:text-slate-200">
                    {getRoleLabel(invite.role)}
                  </span>
                  {canInvite ? (
                    <>
                      <button
                        type="button"
                        disabled={resendInviteId !== null || revokeInviteId !== null}
                        onClick={() => resendInvite(invite.id)}
                        className="rounded-md border app-border-subtle px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {resendInviteId === invite.id ? t("actions.resending") : t("actions.resend")}
                      </button>
                      <button
                        type="button"
                        disabled={revokeInviteId !== null || resendInviteId !== null}
                        onClick={() => revokeInvite(invite.id)}
                        className="rounded-md border border-rose-300/60 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-700/60 dark:text-rose-200 dark:hover:bg-rose-950/30"
                      >
                        {revokeInviteId === invite.id ? t("actions.revoking") : t("actions.revoke")}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
            {t("inviteForm.emailLabel")}
          </span>
          <input
            type="email"
            required
            disabled={!canInvite || submitting}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-slate-900 outline-none ring-[color:var(--ring)] placeholder:text-slate-500 focus:ring-2 disabled:opacity-60 dark:text-slate-50 dark:placeholder:text-slate-400"
            placeholder={t("inviteForm.emailPlaceholder")}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
            {t("inviteForm.roleLabel")}
          </span>
          <select
            disabled={!canInvite || submitting}
            value={role}
            onChange={(event) => setRole(event.target.value as "member" | "admin")}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-slate-900 outline-none ring-[color:var(--ring)] focus:ring-2 disabled:opacity-60 dark:text-slate-50"
          >
            <option value="member">{t("roles.member")}</option>
            <option value="admin">{t("roles.admin")}</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={!canInvite || submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {submitting ? t("actions.sending") : t("actions.sendInvite")}
        </button>
      </form>

      {!canInvite ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          {t("permissions.onlyOwnersAdmins")}
        </p>
      ) : null}

      {feedback ? (
        <p className="mt-3 rounded-lg app-surface-subtle px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
          {feedback}
        </p>
      ) : null}

    </section>
  );
}
