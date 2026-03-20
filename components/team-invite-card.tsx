"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getCsrfHeaders } from "@/lib/http/csrf";

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
  inviteUrl?: string;
};

type TeamMutationResponse = {
  ok?: boolean;
  error?: string;
  inviteUrl?: string;
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
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [submitting, setSubmitting] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
  const [revokeInviteId, setRevokeInviteId] = useState<string | null>(null);
  const [resendInviteId, setResendInviteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canInvite) {
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    setInviteUrl(null);

    try {
      const response = await fetch("/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ email, role }),
      });
      const payload = (await response.json().catch(() => null)) as InviteApiResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to send invite.");
      }

      setEmail("");
      setRole("member");
      setInviteUrl(payload?.inviteUrl ?? null);
      setFeedback(
        payload?.emailSent
          ? "Invite email sent."
          : "Invite created, but email delivery failed. Share the link manually.",
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to send invite.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyInviteUrl() {
    if (!inviteUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setFeedback("Invite link copied.");
    } catch {
      setFeedback("Could not copy invite link.");
    }
  }

  async function removeMember(targetUserId: string) {
    const confirmed = window.confirm(
      "Remove this member from the team? They will immediately lose access.",
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
        throw new Error(payload?.error ?? "Failed to remove member.");
      }

      setFeedback("Member removed.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to remove member.");
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
        throw new Error(payload?.error ?? "Failed to update member role.");
      }
      setFeedback("Member role updated.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to update member role.");
    } finally {
      setUpdatingRoleUserId(null);
    }
  }

  async function revokeInvite(inviteId: string) {
    const confirmed = window.confirm("Revoke this invite?");
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
        throw new Error(payload?.error ?? "Failed to revoke invite.");
      }
      setFeedback("Invite revoked.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to revoke invite.");
    } finally {
      setRevokeInviteId(null);
    }
  }

  async function resendInvite(inviteId: string) {
    setResendInviteId(inviteId);
    setFeedback(null);
    setInviteUrl(null);
    try {
      const response = await fetch(`/api/team/invites/${inviteId}/resend`, {
        method: "POST",
        headers: getCsrfHeaders(),
      });
      const payload = (await response.json().catch(() => null)) as TeamMutationResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to resend invite.");
      }
      setInviteUrl(payload?.inviteUrl ?? null);
      setFeedback("Invite resent.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to resend invite.");
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
        Team members
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Manage who can access {teamName}.
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
                {member.role}
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
                    ? "Saving..."
                    : member.role === "admin"
                      ? "Make member"
                      : "Make admin"}
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
                {removingUserId === member.userId ? "Removing..." : "Remove"}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Pending invites
        </h3>
        {pendingInvites.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            No pending invites.
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
                    Expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="ml-3 flex items-center gap-2">
                  <span className="rounded-full border app-border-subtle px-2 py-0.5 text-xs capitalize text-slate-700 dark:text-slate-200">
                    {invite.role}
                  </span>
                  {canInvite ? (
                    <>
                      <button
                        type="button"
                        disabled={resendInviteId !== null || revokeInviteId !== null}
                        onClick={() => resendInvite(invite.id)}
                        className="rounded-md border app-border-subtle px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {resendInviteId === invite.id ? "Resending..." : "Resend"}
                      </button>
                      <button
                        type="button"
                        disabled={revokeInviteId !== null || resendInviteId !== null}
                        onClick={() => revokeInvite(invite.id)}
                        className="rounded-md border border-rose-300/60 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-700/60 dark:text-rose-200 dark:hover:bg-rose-950/30"
                      >
                        {revokeInviteId === invite.id ? "Revoking..." : "Revoke"}
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
            Invite email
          </span>
          <input
            type="email"
            required
            disabled={!canInvite || submitting}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-slate-900 outline-none ring-[color:var(--ring)] placeholder:text-slate-500 focus:ring-2 disabled:opacity-60 dark:text-slate-50 dark:placeholder:text-slate-400"
            placeholder="teammate@example.com"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
            Role
          </span>
          <select
            disabled={!canInvite || submitting}
            value={role}
            onChange={(event) => setRole(event.target.value as "member" | "admin")}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-slate-900 outline-none ring-[color:var(--ring)] focus:ring-2 disabled:opacity-60 dark:text-slate-50"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={!canInvite || submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {submitting ? "Sending..." : "Send invite"}
        </button>
      </form>

      {!canInvite ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Only owners and admins can invite teammates.
        </p>
      ) : null}

      {feedback ? (
        <p className="mt-3 rounded-lg app-surface-subtle px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
          {feedback}
        </p>
      ) : null}

      {inviteUrl ? (
        <div className="mt-3 rounded-lg app-surface-subtle px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
          <p className="break-all">{inviteUrl}</p>
          <button
            type="button"
            onClick={copyInviteUrl}
            className="mt-2 rounded-md border app-border-subtle px-3 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Copy link
          </button>
        </div>
      ) : null}
    </section>
  );
}
