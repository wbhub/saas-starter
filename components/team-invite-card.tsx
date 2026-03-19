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
            <span className="ml-3 rounded-full border app-border-subtle px-2 py-0.5 text-xs capitalize text-slate-700 dark:text-slate-200">
              {member.role}
            </span>
            {canRemoveMember(member) ? (
              <button
                type="button"
                onClick={() => removeMember(member.userId)}
                className="ml-2 rounded-md border border-rose-300/60 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-700/60 dark:text-rose-200 dark:hover:bg-rose-950/30"
              >
                Remove
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
                <span className="ml-3 rounded-full border app-border-subtle px-2 py-0.5 text-xs capitalize text-slate-700 dark:text-slate-200">
                  {invite.role}
                </span>
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
