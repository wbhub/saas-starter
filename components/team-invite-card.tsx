"use client";

import { FormEvent, useEffect, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Clock, Mail, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { formatUtcDate } from "@/lib/date";
import { type AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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

type BannerState = {
  message: string | null;
  variant: "success" | "error";
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
  banner: BannerState;
};

type TeamInviteAction =
  | { type: "SET_FIELD"; field: "email" | "inviteTeamName"; value: string }
  | { type: "SET_FIELD"; field: "role"; value: "member" | "admin" }
  | { type: "SYNC_TEAM_NAME"; teamName: string }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_SUCCESS"; message: string }
  | { type: "SUBMIT_ERROR"; message: string }
  | { type: "REMOVE_MEMBER_START"; userId: string }
  | { type: "REMOVE_MEMBER_END"; message: string | null; variant: "success" | "error" }
  | { type: "UPDATE_ROLE_START"; userId: string }
  | { type: "UPDATE_ROLE_END"; message: string | null; variant: "success" | "error" }
  | { type: "REVOKE_INVITE_START"; inviteId: string }
  | { type: "REVOKE_INVITE_END"; message: string | null; variant: "success" | "error" }
  | { type: "RESEND_INVITE_START"; inviteId: string }
  | { type: "RESEND_INVITE_END"; message: string | null; variant: "success" | "error" }
  | { type: "CLEAR_BANNER" };

function teamInviteReducer(state: TeamInviteState, action: TeamInviteAction): TeamInviteState {
  const clearBanner = { message: null as string | null, variant: "success" as const };
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "SYNC_TEAM_NAME":
      return { ...state, inviteTeamName: action.teamName };
    case "SUBMIT_START":
      return { ...state, submitting: true, banner: clearBanner };
    case "SUBMIT_SUCCESS":
      return {
        ...state,
        submitting: false,
        email: "",
        role: "member",
        banner: { message: action.message, variant: "success" },
      };
    case "SUBMIT_ERROR":
      return { ...state, submitting: false, banner: { message: action.message, variant: "error" } };
    case "REMOVE_MEMBER_START":
      return { ...state, removingUserId: action.userId, banner: clearBanner };
    case "REMOVE_MEMBER_END":
      return {
        ...state,
        removingUserId: null,
        banner: action.message ? { message: action.message, variant: action.variant } : clearBanner,
      };
    case "UPDATE_ROLE_START":
      return { ...state, updatingRoleUserId: action.userId, banner: clearBanner };
    case "UPDATE_ROLE_END":
      return {
        ...state,
        updatingRoleUserId: null,
        banner: action.message ? { message: action.message, variant: action.variant } : clearBanner,
      };
    case "REVOKE_INVITE_START":
      return { ...state, revokeInviteId: action.inviteId, banner: clearBanner };
    case "REVOKE_INVITE_END":
      return {
        ...state,
        revokeInviteId: null,
        banner: action.message ? { message: action.message, variant: action.variant } : clearBanner,
      };
    case "RESEND_INVITE_START":
      return { ...state, resendInviteId: action.inviteId, banner: clearBanner };
    case "RESEND_INVITE_END":
      return {
        ...state,
        resendInviteId: null,
        banner: action.message ? { message: action.message, variant: action.variant } : clearBanner,
      };
    case "CLEAR_BANNER":
      return { ...state, banner: clearBanner };
  }
}

function memberInitials(fullName: string | null, userId: string) {
  const name = fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return (
    userId
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function TeamInviteCard({
  canInvite,
  canEditTeamName,
  teamName,
  members,
  pendingInvites,
  currentUserId,
  currentUserRole,
  requireTeamNameOnFirstInvite = false,
  seatPriceLabel = null,
}: {
  canInvite: boolean;
  canEditTeamName: boolean;
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
    banner: { message: null, variant: "success" as const },
  });
  const [savingTeamName, setSavingTeamName] = useState(false);
  const [teamNameBanner, setTeamNameBanner] = useState<BannerState>({
    message: null,
    variant: "success",
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
    banner,
  } = state;

  useEffect(() => {
    dispatch({ type: "SYNC_TEAM_NAME", teamName });
  }, [teamName]);

  function getRoleLabel(value: "owner" | "admin" | "member") {
    if (value === "owner") return t("roles.owner");
    if (value === "admin") return t("roles.admin");
    return t("roles.member");
  }

  async function handleSaveTeamName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditTeamName) {
      return;
    }

    const normalized = inviteTeamName.trim();
    if (normalized.length < 2) {
      setTeamNameBanner({ message: t("errors.teamNameTooShort"), variant: "error" });
      return;
    }
    if (normalized === teamName.trim()) {
      setTeamNameBanner({ message: t("feedback.teamNameUnchanged"), variant: "success" });
      return;
    }

    setSavingTeamName(true);
    setTeamNameBanner({ message: null, variant: "success" });
    dispatch({ type: "CLEAR_BANNER" });

    try {
      const response = await fetch("/api/team/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getCsrfHeaders(),
        },
        body: JSON.stringify({ teamName: normalized }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.updateTeamName"));
      }
      setTeamNameBanner({ message: t("feedback.teamNameUpdated"), variant: "success" });
      router.refresh();
    } catch (error) {
      setTeamNameBanner({
        message: error instanceof Error ? error.message : t("errors.updateTeamName"),
        variant: "error",
      });
    } finally {
      setSavingTeamName(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canInvite) {
      return;
    }

    dispatch({ type: "SUBMIT_START" });
    setTeamNameBanner({ message: null, variant: "success" });

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
        message: payload?.emailSent
          ? t("feedback.inviteEmailSent")
          : t("feedback.inviteCreatedEmailFailed"),
      });
      router.refresh();
    } catch (error) {
      dispatch({
        type: "SUBMIT_ERROR",
        message: error instanceof Error ? error.message : t("errors.sendInvite"),
      });
    }
  }

  async function removeMember(targetUserId: string) {
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
        message: payload?.warning ?? t("feedback.memberRemoved"),
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      dispatch({
        type: "REMOVE_MEMBER_END",
        message: error instanceof Error ? error.message : t("errors.removeMember"),
        variant: "error",
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
      dispatch({
        type: "UPDATE_ROLE_END",
        message: t("feedback.roleUpdated"),
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      dispatch({
        type: "UPDATE_ROLE_END",
        message: error instanceof Error ? error.message : t("errors.updateRole"),
        variant: "error",
      });
    }
  }

  async function revokeInvite(inviteId: string) {
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
      dispatch({
        type: "REVOKE_INVITE_END",
        message: t("feedback.inviteRevoked"),
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      dispatch({
        type: "REVOKE_INVITE_END",
        message: error instanceof Error ? error.message : t("errors.revokeInvite"),
        variant: "error",
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
      const message =
        payload?.deliveryStatus === "sent" || payload?.emailSent
          ? t("feedback.inviteResent")
          : payload?.deliveryStatus === "failed_preserved"
            ? t("feedback.inviteResentEmailFailedPreserved")
            : t("feedback.inviteResentEmailFailed");
      dispatch({
        type: "RESEND_INVITE_END",
        message,
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      dispatch({
        type: "RESEND_INVITE_END",
        message: error instanceof Error ? error.message : t("errors.resendInvite"),
        variant: "error",
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

  /** Solo (only you) or empty list after a failed load — both use the same dashed empty state as Pending invites. */
  const showPeopleEmptyState = members.length <= 1;

  return (
    <Card className="overflow-hidden border app-border-subtle bg-card text-card-foreground shadow-sm ring-1 ring-border/40">
      <CardHeader className="border-b border-border/60 px-5 py-4 sm:px-6">
        <CardTitle className="font-heading text-lg font-semibold tracking-tight">
          {t("title")}
        </CardTitle>
        <CardDescription className="mt-1.5 text-sm leading-snug">
          {t("description", { teamName })}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-0 px-0 pb-6 pt-0">
        {canEditTeamName ? (
          <>
            <div className="px-5 pt-5 sm:px-6">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Building2
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  strokeWidth={2}
                  aria-hidden
                />
                {t("teamName.sectionTitle")}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("teamName.sectionDescription")}
              </p>
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
                onSubmit={handleSaveTeamName}
              >
                <div className="w-full max-w-sm">
                  <Input
                    id="team-name-input"
                    type="text"
                    autoComplete="organization"
                    minLength={2}
                    maxLength={80}
                    disabled={savingTeamName}
                    value={inviteTeamName}
                    onChange={(event) =>
                      dispatch({
                        type: "SET_FIELD",
                        field: "inviteTeamName",
                        value: event.target.value,
                      })
                    }
                    placeholder={t("inviteForm.teamNamePlaceholder")}
                    aria-label={t("inviteForm.teamNameLabel")}
                    className="h-8 w-full py-1.5 text-sm"
                  />
                </div>
                <SubmitButton
                  className="h-8 w-full shrink-0 py-1.5 text-sm sm:w-auto"
                  loading={savingTeamName}
                  pendingLabel={t("teamName.saving")}
                  idleLabel={t("teamName.save")}
                />
              </form>
              {requireTeamNameOnFirstInvite ? (
                <p className="mt-2 text-xs text-muted-foreground">{t("inviteForm.teamNameHint")}</p>
              ) : null}
              <FormMessage status={teamNameBanner.variant} message={teamNameBanner.message} />
            </div>
            <Separator className="my-6" />
          </>
        ) : null}

        <div className={cn("px-5 sm:px-6", !canEditTeamName && "pt-5")}>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
            {t("inviteForm.sectionTitle")}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("inviteForm.sectionDescription")}</p>

          <form className="mt-3" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8.5rem_auto] sm:gap-x-3 sm:gap-y-1">
              <Label
                htmlFor="invite-email"
                className="text-xs sm:col-start-1 sm:row-start-1 sm:self-end"
              >
                {t("inviteForm.emailLabel")}
              </Label>
              <Input
                id="invite-email"
                type="email"
                required
                disabled={!canInvite || submitting}
                value={email}
                onChange={(event) =>
                  dispatch({ type: "SET_FIELD", field: "email", value: event.target.value })
                }
                placeholder={t("inviteForm.emailPlaceholder")}
                autoComplete="off"
                className="h-8 min-w-0 py-1.5 text-sm sm:col-start-1 sm:row-start-2 sm:w-full"
              />
              <Label className="text-xs sm:col-start-2 sm:row-start-1 sm:self-end">
                {t("inviteForm.roleLabel")}
              </Label>
              <div className="min-w-0 sm:col-start-2 sm:row-start-2 sm:w-[8.5rem] sm:justify-self-stretch">
                <Select
                  disabled={!canInvite || submitting}
                  value={role}
                  onValueChange={(value) =>
                    dispatch({
                      type: "SET_FIELD",
                      field: "role",
                      value: value as "member" | "admin",
                    })
                  }
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue>{getRoleLabel(role)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">{t("roles.member")}</SelectItem>
                    <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-start-3 sm:row-start-2 sm:self-end sm:justify-self-end">
                <SubmitButton
                  className="h-8 w-full min-w-0 px-4 py-1.5 text-sm sm:min-w-[7.5rem]"
                  loading={submitting}
                  disabled={!canInvite}
                  pendingLabel={t("actions.sending")}
                  idleLabel={t("actions.sendInvite")}
                />
              </div>
            </div>
          </form>

          {seatPriceLabel && canInvite ? (
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/90">
              {t("pricing.perSeat", { amount: seatPriceLabel })}
            </p>
          ) : null}

          {!canInvite ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {t("permissions.onlyOwnersAdmins")}
            </p>
          ) : null}

          <FormMessage status={banner.variant} message={banner.message} />
        </div>

        <Separator className="my-6" />

        <div className="px-5 sm:px-6">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
            {t("members.title")}
          </div>
          {members.length > 1 ? (
            <p className="mt-1 text-xs text-muted-foreground">{t("members.description")}</p>
          ) : null}

          {showPeopleEmptyState ? (
            <p
              className="mt-2 rounded-md border border-dashed border-border/50 bg-transparent px-3 py-4 text-center text-xs text-muted-foreground"
              role="status"
            >
              {members.length === 0 ? t("members.emptyList") : t("members.noOtherMembers")}
            </p>
          ) : (
            <div
              className="mt-2 rounded-md border border-dashed border-border/50 bg-transparent p-2"
              aria-label={t("members.title")}
            >
              <ul className="space-y-1.5">
                {members.map((member) => (
                  <li
                    key={member.userId}
                    className="flex flex-col gap-2 rounded-md px-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                          "bg-muted/80 text-foreground ring-1 ring-border/50",
                        )}
                        aria-hidden
                      >
                        {memberInitials(member.fullName, member.userId)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {member.fullName?.trim() || t("members.unnamed")}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {member.userId}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pl-10 sm:pl-0">
                      <span className="text-xs font-medium text-muted-foreground">
                        {getRoleLabel(member.role)}
                      </span>
                      {canManageRole(member) ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={updatingRoleUserId !== null}
                          onClick={() =>
                            updateMemberRole(
                              member.userId,
                              member.role === "admin" ? "member" : "admin",
                            )
                          }
                          className="text-muted-foreground"
                        >
                          {updatingRoleUserId === member.userId
                            ? t("actions.saving")
                            : member.role === "admin"
                              ? t("actions.makeMember")
                              : t("actions.makeAdmin")}
                        </Button>
                      ) : null}
                      {canRemoveMember(member) ? (
                        <ConfirmDialog
                          title={t("confirmations.removeMemberTitle")}
                          description={t("confirmations.removeMember")}
                          confirmLabel={t("actions.remove")}
                          cancelLabel={t("actions.cancel")}
                          variant="destructive"
                          onConfirm={() => removeMember(member.userId)}
                        >
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={removingUserId !== null}
                            className="border-rose-300/60 text-rose-700 hover:bg-rose-50 dark:border-rose-700/60 dark:text-rose-200 dark:hover:bg-rose-950/30"
                          >
                            {removingUserId === member.userId
                              ? t("actions.removing")
                              : t("actions.remove")}
                          </Button>
                        </ConfirmDialog>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <Separator className="my-6" />

        <div className="px-5 pb-5 sm:px-6">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
            {t("pending.title")}
          </div>
          {pendingInvites.length === 0 ? (
            <p className="mt-2 rounded-md border border-dashed border-border/50 bg-transparent px-3 py-4 text-center text-xs text-muted-foreground">
              {t("pending.none")}
            </p>
          ) : (
            <ul className="mt-4 space-y-2" aria-label={t("pending.title")}>
              {pendingInvites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
                    <div
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/80 text-muted-foreground sm:mt-0"
                      aria-hidden
                    >
                      <Mail className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{invite.email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t("pending.expires", {
                          date: formatUtcDate(invite.expiresAt, undefined, locale),
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pl-12 sm:pl-0">
                    <span className="text-xs font-medium text-muted-foreground">
                      {getRoleLabel(invite.role)}
                    </span>
                    {canInvite ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={resendInviteId !== null || revokeInviteId !== null}
                          onClick={() => resendInvite(invite.id)}
                          className="text-muted-foreground"
                        >
                          {resendInviteId === invite.id
                            ? t("actions.resending")
                            : t("actions.resend")}
                        </Button>
                        <ConfirmDialog
                          title={t("confirmations.revokeInviteTitle")}
                          description={t("confirmations.revokeInvite")}
                          confirmLabel={t("actions.revoke")}
                          cancelLabel={t("actions.cancel")}
                          variant="destructive"
                          onConfirm={() => revokeInvite(invite.id)}
                        >
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={revokeInviteId !== null || resendInviteId !== null}
                            className="border-rose-300/60 text-rose-700 hover:bg-rose-50 dark:border-rose-700/60 dark:text-rose-200 dark:hover:bg-rose-950/30"
                          >
                            {revokeInviteId === invite.id
                              ? t("actions.revoking")
                              : t("actions.revoke")}
                          </Button>
                        </ConfirmDialog>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
