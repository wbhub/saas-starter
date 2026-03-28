"use client";

import { FormEvent, useReducer } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { formatUtcDate } from "@/lib/date";
import { type AppLocale } from "@/i18n/routing";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/ui/form-message";

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
  warning?: string;
};

type TeamMutationResponse = {
  ok?: boolean;
  error?: string;
  emailSent?: boolean;
  deliveryStatus?: "sent" | "failed_preserved" | "failed_rotated";
  warning?: string;
};

type TeamInviteState = {
  email: string;
  role: "member" | "admin";
  inviteTeamName: string;
  submitting: boolean;
  removingUserId: string | null;
  updatingRoleUserId: string | null;
  revokeInviteId: string | null;
  resendInviteId: string | null;
  feedback: string | null;
};

type TeamInviteAction =
  | { type: "SET_FIELD"; field: "email" | "inviteTeamName"; value: string }
  | { type: "SET_FIELD"; field: "role"; value: "member" | "admin" }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_SUCCESS"; feedback: string }
  | { type: "SUBMIT_ERROR"; feedback: string }
  | { type: "REMOVE_MEMBER_START"; userId: string }
  | { type: "REMOVE_MEMBER_END"; feedback: string | null }
  | { type: "UPDATE_ROLE_START"; userId: string }
  | { type: "UPDATE_ROLE_END"; feedback: string | null }
  | { type: "REVOKE_INVITE_START"; inviteId: string }
  | { type: "REVOKE_INVITE_END"; feedback: string | null }
  | { type: "RESEND_INVITE_START"; inviteId: string }
  | { type: "RESEND_INVITE_END"; feedback: string | null };

function teamInviteReducer(state: TeamInviteState, action: TeamInviteAction): TeamInviteState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "SUBMIT_START":
      return { ...state, submitting: true, feedback: null };
    case "SUBMIT_SUCCESS":
      return { ...state, submitting: false, email: "", role: "member", feedback: action.feedback };
    case "SUBMIT_ERROR":
      return { ...state, submitting: false, feedback: action.feedback };
    case "REMOVE_MEMBER_START":
      return { ...state, removingUserId: action.userId, feedback: null };
    case "REMOVE_MEMBER_END":
      return { ...state, removingUserId: null, feedback: action.feedback };
    case "UPDATE_ROLE_START":
      return { ...state, updatingRoleUserId: action.userId, feedback: null };
    case "UPDATE_ROLE_END":
      return { ...state, updatingRoleUserId: null, feedback: action.feedback };
    case "REVOKE_INVITE_START":
      return { ...state, revokeInviteId: action.inviteId, feedback: null };
    case "REVOKE_INVITE_END":
      return { ...state, revokeInviteId: null, feedback: action.feedback };
    case "RESEND_INVITE_START":
      return { ...state, resendInviteId: action.inviteId, feedback: null };
    case "RESEND_INVITE_END":
      return { ...state, resendInviteId: null, feedback: action.feedback };
  }
}

export function TeamInviteCard({
  canInvite,
  teamName,
  members,
  pendingInvites,
  currentUserId,
  currentUserRole,
  requireTeamNameOnFirstInvite = false,
  seatPriceLabel = null,
}: {
  canInvite: boolean;
  teamName: string;
  members: TeamMember[];
  pendingInvites: PendingInvite[];
  currentUserId: string;
  currentUserRole: "owner" | "admin" | "member";
  requireTeamNameOnFirstInvite?: boolean;
  seatPriceLabel?: string | null;
}) {
  const t = useTranslations("TeamInviteCard");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [state, dispatch] = useReducer(teamInviteReducer, {
    email: "",
    role: "member",
    inviteTeamName: teamName,
    submitting: false,
    removingUserId: null,
    updatingRoleUserId: null,
    revokeInviteId: null,
    resendInviteId: null,
    feedback: null,
  });
  const {
    email,
    role,
    inviteTeamName,
    submitting,
    removingUserId,
    updatingRoleUserId,
    revokeInviteId,
    resendInviteId,
    feedback,
  } = state;

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

    dispatch({ type: "SUBMIT_START" });

    try {
      const normalizedInviteTeamName = inviteTeamName.trim();
      if (requireTeamNameOnFirstInvite && normalizedInviteTeamName.length < 2) {
        throw new Error(t("errors.teamNameRequired"));
      }

      const shouldUpdateTeamName =
        requireTeamNameOnFirstInvite &&
        normalizedInviteTeamName.length >= 2 &&
        normalizedInviteTeamName !== teamName.trim();

      if (shouldUpdateTeamName) {
        const teamNameResponse = await fetch("/api/team/settings", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getCsrfHeaders(),
          },
          body: JSON.stringify({ teamName: normalizedInviteTeamName }),
        });
        const teamNamePayload = (await teamNameResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!teamNameResponse.ok) {
          throw new Error(teamNamePayload?.error ?? t("errors.updateTeamName"));
        }
      }

      const response = await fetch("/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ email, role }),
      });
      const payload = (await response.json().catch(() => null)) as InviteApiResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.sendInvite"));
      }

      dispatch({
        type: "SUBMIT_SUCCESS",
        feedback: payload?.emailSent
          ? t("feedback.inviteEmailSent")
          : t("feedback.inviteCreatedEmailFailed"),
      });
      router.refresh();
    } catch (error) {
      dispatch({
        type: "SUBMIT_ERROR",
        feedback: error instanceof Error ? error.message : t("errors.sendInvite"),
      });
    }
  }

  async function removeMember(targetUserId: string) {
    const confirmed = window.confirm(t("confirmations.removeMember"));
    if (!confirmed) {
      return;
    }

    dispatch({ type: "REMOVE_MEMBER_START", userId: targetUserId });

    try {
      const response = await fetch(`/api/team/members/${targetUserId}`, {
        method: "DELETE",
        headers: getCsrfHeaders(),
      });
      const payload = (await response.json().catch(() => null)) as TeamMutationResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.removeMember"));
      }

      dispatch({
        type: "REMOVE_MEMBER_END",
        feedback: payload?.warning ?? t("feedback.memberRemoved"),
      });
      router.refresh();
    } catch (error) {
      dispatch({
        type: "REMOVE_MEMBER_END",
        feedback: error instanceof Error ? error.message : t("errors.removeMember"),
      });
    }
  }

  async function updateMemberRole(targetUserId: string, newRole: "member" | "admin") {
    dispatch({ type: "UPDATE_ROLE_START", userId: targetUserId });
    try {
      const response = await fetch(`/api/team/members/${targetUserId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getCsrfHeaders(),
        },
        body: JSON.stringify({ role: newRole }),
      });
      const payload = (await response.json().catch(() => null)) as TeamMutationResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.updateRole"));
      }
      dispatch({ type: "UPDATE_ROLE_END", feedback: t("feedback.roleUpdated") });
      router.refresh();
    } catch (error) {
      dispatch({
        type: "UPDATE_ROLE_END",
        feedback: error instanceof Error ? error.message : t("errors.updateRole"),
      });
    }
  }

  async function revokeInvite(inviteId: string) {
    const confirmed = window.confirm(t("confirmations.revokeInvite"));
    if (!confirmed) {
      return;
    }
    dispatch({ type: "REVOKE_INVITE_START", inviteId });
    try {
      const response = await fetch(`/api/team/invites/${inviteId}`, {
        method: "DELETE",
        headers: getCsrfHeaders(),
      });
      const payload = (await response.json().catch(() => null)) as TeamMutationResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.revokeInvite"));
      }
      dispatch({ type: "REVOKE_INVITE_END", feedback: t("feedback.inviteRevoked") });
      router.refresh();
    } catch (error) {
      dispatch({
        type: "REVOKE_INVITE_END",
        feedback: error instanceof Error ? error.message : t("errors.revokeInvite"),
      });
    }
  }

  async function resendInvite(inviteId: string) {
    dispatch({ type: "RESEND_INVITE_START", inviteId });
    try {
      const response = await fetch(`/api/team/invites/${inviteId}/resend`, {
        method: "POST",
        headers: getCsrfHeaders(),
      });
      const payload = (await response.json().catch(() => null)) as TeamMutationResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.resendInvite"));
      }
      const feedback =
        payload?.deliveryStatus === "sent" || payload?.emailSent
          ? t("feedback.inviteResent")
          : payload?.deliveryStatus === "failed_preserved"
            ? t("feedback.inviteResentEmailFailedPreserved")
            : t("feedback.inviteResentEmailFailed");
      dispatch({
        type: "RESEND_INVITE_END",
        feedback,
      });
      router.refresh();
    } catch (error) {
      dispatch({
        type: "RESEND_INVITE_END",
        feedback: error instanceof Error ? error.message : t("errors.resendInvite"),
      });
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
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-2 text-muted-foreground">{t("description", { teamName })}</p>
      {seatPriceLabel ? (
        <p className="mt-2 rounded-lg app-surface-subtle px-3 py-2 text-sm text-muted-foreground">
          {t("pricing.perSeat", { amount: seatPriceLabel })}
        </p>
      ) : null}

      <div className="mt-4 space-y-2 text-sm">
        {members.map((member) => (
          <div
            key={`${member.userId}:${member.role}`}
            className="flex items-center justify-between rounded-md app-surface-subtle px-3 py-2"
          >
            <div className="truncate">
              <p className="truncate font-medium text-foreground">
                {member.fullName?.trim() || member.userId}
              </p>
              <p className="truncate text-xs text-muted-foreground">{member.userId}</p>
            </div>
            <div className="ml-3 flex items-center gap-2">
              <span className="rounded-full border app-border-subtle px-2 py-0.5 text-xs capitalize text-muted-foreground">
                {getRoleLabel(member.role)}
              </span>
              {canManageRole(member) ? (
                <button
                  type="button"
                  disabled={updatingRoleUserId !== null}
                  onClick={() =>
                    updateMemberRole(member.userId, member.role === "admin" ? "member" : "admin")
                  }
                  className="rounded-md border app-border-subtle px-2 py-0.5 text-xs text-muted-foreground hover:bg-surface-hover disabled:opacity-60"
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
        <h3 className="text-sm font-medium text-foreground">{t("pending.title")}</h3>
        {pendingInvites.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("pending.none")}</p>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between rounded-md app-surface-subtle px-3 py-2"
              >
                <div className="truncate">
                  <p className="truncate text-foreground">{invite.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("pending.expires", {
                      date: formatUtcDate(invite.expiresAt, undefined, locale),
                    })}
                  </p>
                </div>
                <div className="ml-3 flex items-center gap-2">
                  <span className="rounded-full border app-border-subtle px-2 py-0.5 text-xs capitalize text-muted-foreground">
                    {getRoleLabel(invite.role)}
                  </span>
                  {canInvite ? (
                    <>
                      <button
                        type="button"
                        disabled={resendInviteId !== null || revokeInviteId !== null}
                        onClick={() => resendInvite(invite.id)}
                        className="rounded-md border app-border-subtle px-2 py-0.5 text-xs text-muted-foreground hover:bg-surface-hover disabled:opacity-60"
                      >
                        {resendInviteId === invite.id
                          ? t("actions.resending")
                          : t("actions.resend")}
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
        {requireTeamNameOnFirstInvite ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">
              {t("inviteForm.teamNameLabel")}
            </span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              disabled={!canInvite || submitting}
              value={inviteTeamName}
              onChange={(event) =>
                dispatch({ type: "SET_FIELD", field: "inviteTeamName", value: event.target.value })
              }
              className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-ring placeholder:text-muted-foreground focus:ring-2 disabled:opacity-60"
              placeholder={t("inviteForm.teamNamePlaceholder")}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("inviteForm.teamNameHint")}</p>
          </label>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            {t("inviteForm.emailLabel")}
          </span>
          <Input
            type="email"
            required
            disabled={!canInvite || submitting}
            value={email}
            onChange={(event) =>
              dispatch({ type: "SET_FIELD", field: "email", value: event.target.value })
            }
            placeholder={t("inviteForm.emailPlaceholder")}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            {t("inviteForm.roleLabel")}
          </span>
          <select
            disabled={!canInvite || submitting}
            value={role}
            onChange={(event) =>
              dispatch({
                type: "SET_FIELD",
                field: "role",
                value: event.target.value as "member" | "admin",
              })
            }
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2 disabled:opacity-60"
          >
            <option value="member">{t("roles.member")}</option>
            <option value="admin">{t("roles.admin")}</option>
          </select>
        </label>

        <SubmitButton
          loading={submitting}
          disabled={!canInvite}
          pendingLabel={t("actions.sending")}
          idleLabel={t("actions.sendInvite")}
        />
      </form>

      {!canInvite ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("permissions.onlyOwnersAdmins")}</p>
      ) : null}

      <FormMessage status="success" message={feedback} />
    </section>
  );
}
