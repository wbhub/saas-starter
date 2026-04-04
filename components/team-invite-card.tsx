"use client";

import { FormEvent, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Clock, Mail, UserMinus, Users, X } from "lucide-react";
import { DashboardPageSection } from "@/components/dashboard-page-section";
import { useLocale, useTranslations } from "next-intl";
import { clientFetch, clientPatchJson, clientPostJson } from "@/lib/http/client-fetch";
import { formatUtcDate } from "@/lib/date";
import { type AppLocale } from "@/i18n/routing";
import {
  describeInviteBatchOutcome,
  isInviteEmailInputValid,
  normalizeInviteEmailInput,
  parseInviteEmailPaste,
} from "@/lib/team-invite-form";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type TeamMember = {
  userId: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: "owner" | "admin" | "member";
};

type PendingInvite = {
  id: string;
  email: string;
  role: "owner" | "admin" | "member";
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
  emails: string[];
  currentInput: string;
  inputError: string | null;
  role: "member" | "admin" | "owner";
  inviteTeamName: string;
  submitting: boolean;
  removingUserId: string | null;
  updatingRoleUserId: string | null;
  revokeInviteId: string | null;
  resendInviteId: string | null;
  banner: BannerState;
};

type TeamInviteAction =
  | { type: "SET_FIELD"; field: "inviteTeamName"; value: string }
  | { type: "SET_FIELD"; field: "role"; value: "member" | "admin" | "owner" }
  | { type: "SET_CURRENT_INPUT"; value: string }
  | { type: "ADD_EMAIL"; email: string }
  | { type: "ADD_EMAILS"; emails: string[] }
  | { type: "REMOVE_EMAIL"; email: string }
  | { type: "SET_INPUT_ERROR"; error: string | null }
  | { type: "SUBMIT_PARTIAL"; message: string; failedEmails: string[] }
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
    case "SET_CURRENT_INPUT":
      return { ...state, currentInput: action.value, inputError: null };
    case "ADD_EMAIL":
      return {
        ...state,
        emails: [...state.emails, action.email],
        currentInput: "",
        inputError: null,
      };
    case "ADD_EMAILS":
      return {
        ...state,
        emails: [...state.emails, ...action.emails],
        inputError: null,
      };
    case "REMOVE_EMAIL":
      return { ...state, emails: state.emails.filter((e) => e !== action.email) };
    case "SET_INPUT_ERROR":
      return { ...state, inputError: action.error };
    case "SYNC_TEAM_NAME":
      return { ...state, inviteTeamName: action.teamName };
    case "SUBMIT_START":
      return { ...state, submitting: true, banner: clearBanner };
    case "SUBMIT_SUCCESS":
      return {
        ...state,
        submitting: false,
        emails: [],
        currentInput: "",
        inputError: null,
        role: "member",
        banner: { message: action.message, variant: "success" },
      };
    case "SUBMIT_ERROR":
      return { ...state, submitting: false, banner: { message: action.message, variant: "error" } };
    case "SUBMIT_PARTIAL":
      return {
        ...state,
        submitting: false,
        emails: action.failedEmails,
        currentInput: "",
        inputError: null,
        banner: { message: action.message, variant: "error" },
      };
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
  const tCommon = useTranslations("Common");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [state, dispatch] = useReducer(teamInviteReducer, {
    emails: [],
    currentInput: "",
    inputError: null,
    role: "member",
    inviteTeamName: teamName,
    submitting: false,
    removingUserId: null,
    updatingRoleUserId: null,
    revokeInviteId: null,
    resendInviteId: null,
    banner: { message: null, variant: "success" as const },
  });
  const [teamNameSaveStatus, setTeamNameSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [teamNameBanner, setTeamNameBanner] = useState<BannerState>({
    message: null,
    variant: "success",
  });
  const [removeDialogUserId, setRemoveDialogUserId] = useState<string | null>(null);
  const inviteTeamNameRef = useRef(teamName);
  const teamNameDirtyRef = useRef(false);
  const teamNameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teamNameSavedIndicatorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teamNamePersistRef = useRef(false);

  const {
    emails,
    currentInput,
    inputError,
    role,
    inviteTeamName,
    submitting,
    removingUserId,
    updatingRoleUserId,
    revokeInviteId,
    resendInviteId,
    banner,
  } = state;

  const emailInputRef = useRef<HTMLInputElement>(null);

  const commitEmail = useCallback(
    (raw: string): boolean => {
      const trimmed = normalizeInviteEmailInput(raw);
      if (!trimmed) return false;
      if (!isInviteEmailInputValid(trimmed)) {
        dispatch({
          type: "SET_INPUT_ERROR",
          error: t("errors.invalidEmailInList", { email: trimmed }),
        });
        return false;
      }
      if (emails.includes(trimmed)) {
        dispatch({
          type: "SET_INPUT_ERROR",
          error: t("errors.duplicateEmail", { email: trimmed }),
        });
        return false;
      }
      dispatch({ type: "ADD_EMAIL", email: trimmed });
      return true;
    },
    [emails, t],
  );

  useEffect(() => {
    if (teamNameDirtyRef.current) {
      return;
    }
    dispatch({ type: "SYNC_TEAM_NAME", teamName });
    inviteTeamNameRef.current = teamName;
  }, [teamName]);

  useEffect(
    () => () => {
      if (teamNameDebounceRef.current) {
        clearTimeout(teamNameDebounceRef.current);
      }
      if (teamNameSavedIndicatorRef.current) {
        clearTimeout(teamNameSavedIndicatorRef.current);
      }
    },
    [],
  );

  function getRoleLabel(value: "owner" | "admin" | "member") {
    return tCommon(`teamRoles.${value}`);
  }

  const TEAM_NAME_AUTOSAVE_MS = 600;

  function scheduleTeamNameAutosave() {
    if (teamNameDebounceRef.current) {
      clearTimeout(teamNameDebounceRef.current);
    }
    teamNameDebounceRef.current = setTimeout(() => {
      teamNameDebounceRef.current = null;
      void persistTeamName();
    }, TEAM_NAME_AUTOSAVE_MS);
  }

  /** One PATCH; may recurse if the user kept typing while the request was in flight. */
  async function saveTeamNameOnce(): Promise<void> {
    const normalized = inviteTeamNameRef.current.trim();
    if (normalized.length < 2) {
      return;
    }
    if (normalized === teamName.trim()) {
      teamNameDirtyRef.current = false;
      setTeamNameSaveStatus("idle");
      return;
    }

    setTeamNameSaveStatus("saving");
    setTeamNameBanner({ message: null, variant: "success" });
    dispatch({ type: "CLEAR_BANNER" });

    await clientPatchJson(
      "/api/team/settings",
      { teamName: normalized },
      {
        fallbackErrorMessage: t("errors.updateTeamName"),
      },
    );

    const latest = inviteTeamNameRef.current.trim();
    if (latest !== normalized) {
      await saveTeamNameOnce();
      return;
    }

    teamNameDirtyRef.current = false;
    if (teamNameSavedIndicatorRef.current) {
      clearTimeout(teamNameSavedIndicatorRef.current);
    }
    setTeamNameSaveStatus("saved");
    teamNameSavedIndicatorRef.current = setTimeout(() => {
      teamNameSavedIndicatorRef.current = null;
      setTeamNameSaveStatus("idle");
    }, 2000);
    router.refresh();
  }

  async function persistTeamName() {
    if (!canEditTeamName || teamNamePersistRef.current) {
      return;
    }

    const normalized = inviteTeamNameRef.current.trim();
    if (normalized.length < 2) {
      return;
    }
    if (normalized === teamName.trim()) {
      teamNameDirtyRef.current = false;
      setTeamNameSaveStatus("idle");
      return;
    }

    teamNamePersistRef.current = true;
    try {
      await saveTeamNameOnce();
    } catch (error) {
      setTeamNameSaveStatus("idle");
      setTeamNameBanner({
        message: error instanceof Error ? error.message : t("errors.updateTeamName"),
        variant: "error",
      });
    } finally {
      teamNamePersistRef.current = false;
    }
  }

  function handleTeamNameBlur() {
    if (teamNameDebounceRef.current) {
      clearTimeout(teamNameDebounceRef.current);
      teamNameDebounceRef.current = null;
    }
    const normalized = inviteTeamNameRef.current.trim();
    if (normalized.length > 0 && normalized.length < 2) {
      setTeamNameBanner({ message: t("errors.teamNameTooShort"), variant: "error" });
      setTeamNameSaveStatus("idle");
      return;
    }
    if (normalized.length >= 2) {
      void persistTeamName();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canInvite) {
      return;
    }

    // Build the final list: committed chips + whatever is still in the input
    const finalEmails = [...emails];
    const trailing = normalizeInviteEmailInput(currentInput);
    if (trailing) {
      if (!isInviteEmailInputValid(trailing)) {
        dispatch({
          type: "SET_INPUT_ERROR",
          error: t("errors.invalidEmailInList", { email: trailing }),
        });
        return;
      }
      if (!finalEmails.includes(trailing)) {
        finalEmails.push(trailing);
      }
    }

    if (finalEmails.length === 0) {
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
        await clientPatchJson(
          "/api/team/settings",
          { teamName: normalizedInviteTeamName },
          {
            fallbackErrorMessage: t("errors.updateTeamName"),
          },
        );
      }

      // Send invites sequentially, tracking failures for retry
      let deliveredCount = 0;
      let createdWithoutEmailCount = 0;
      const failedEmails: string[] = [];

      for (const emailAddr of finalEmails) {
        try {
          const payload = await clientPostJson<InviteApiResponse>(
            "/api/team/invites",
            { email: emailAddr, role },
            {
              fallbackErrorMessage: t("errors.sendInvite"),
            },
          );
          if (payload.emailSent === false) {
            createdWithoutEmailCount++;
          } else {
            deliveredCount++;
          }
        } catch {
          failedEmails.push(emailAddr);
        }
      }

      const feedback = describeInviteBatchOutcome({
        totalCount: finalEmails.length,
        deliveredCount,
        createdWithoutEmailCount,
        failedCount: failedEmails.length,
      });
      const message = t(feedback.messageKey, feedback.values);

      if (feedback.kind === "success") {
        dispatch({
          type: "SUBMIT_SUCCESS",
          message,
        });
      } else if (feedback.kind === "error") {
        dispatch({
          type: "SUBMIT_ERROR",
          message,
        });
      } else {
        // Partial failure: keep only request failures as chips for retry.
        dispatch({
          type: "SUBMIT_PARTIAL",
          message,
          failedEmails,
        });
      }
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
      const response = await clientFetch(`/api/team/members/${targetUserId}`, {
        method: "DELETE",
        fallbackErrorMessage: t("errors.removeMember"),
      });
      const payload = (await response.json()) as TeamMutationResponse | null;

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

  async function updateMemberRole(targetUserId: string, newRole: "member" | "admin" | "owner") {
    dispatch({ type: "UPDATE_ROLE_START", userId: targetUserId });
    try {
      await clientPatchJson(
        `/api/team/members/${targetUserId}`,
        { role: newRole },
        {
          fallbackErrorMessage: t("errors.updateRole"),
        },
      );
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
      await clientFetch(`/api/team/invites/${inviteId}`, {
        method: "DELETE",
        fallbackErrorMessage: t("errors.revokeInvite"),
      });
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
      const response = await clientFetch(`/api/team/invites/${inviteId}/resend`, {
        method: "POST",
        fallbackErrorMessage: t("errors.resendInvite"),
      });
      const payload = (await response.json()) as TeamMutationResponse | null;
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
    <div className="space-y-6">
      {canEditTeamName ? (
        <DashboardPageSection
          icon={Building2}
          title={t("teamName.sectionTitle")}
          description={t("teamName.sectionDescription")}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="w-full max-w-sm">
              <Input
                id="team-name-input"
                type="text"
                autoComplete="organization"
                minLength={2}
                maxLength={80}
                value={inviteTeamName}
                onChange={(event) => {
                  const value = event.target.value;
                  inviteTeamNameRef.current = value;
                  teamNameDirtyRef.current = true;
                  dispatch({
                    type: "SET_FIELD",
                    field: "inviteTeamName",
                    value,
                  });
                  setTeamNameBanner({ message: null, variant: "success" });
                  if (teamNameSaveStatus === "saved") {
                    setTeamNameSaveStatus("idle");
                  }
                  scheduleTeamNameAutosave();
                }}
                onBlur={handleTeamNameBlur}
                placeholder={t("inviteForm.teamNamePlaceholder")}
                aria-label={t("inviteForm.teamNameLabel")}
                aria-busy={teamNameSaveStatus === "saving"}
                className="h-10 min-w-0 w-full py-2 text-sm"
              />
            </div>
            <p
              className="min-h-[1.25rem] text-xs text-muted-foreground sm:min-w-[5.5rem]"
              aria-live="polite"
            >
              {teamNameSaveStatus === "saving" ? t("teamName.saving") : null}
              {teamNameSaveStatus === "saved" ? t("teamName.saved") : null}
            </p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t("teamName.autosaveHint")}
          </p>
          <FormMessage status={teamNameBanner.variant} message={teamNameBanner.message} />
        </DashboardPageSection>
      ) : null}

      <DashboardPageSection
        icon={Mail}
        title={t("inviteForm.sectionTitle")}
        description={t("inviteForm.sectionDescription")}
      >
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
            <div className="min-w-0 flex-1">
              <Label htmlFor="invite-email" className="mb-1 block text-xs">
                {t("inviteForm.emailLabel")}
              </Label>
              <div
                className={cn(
                  "flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
                  (!canInvite || submitting) && "cursor-not-allowed opacity-50",
                )}
                onClick={() => emailInputRef.current?.focus()}
              >
                {emails.map((emailAddr) => (
                  <Badge
                    key={emailAddr}
                    variant="secondary"
                    className="h-6 gap-1 pl-2.5 pr-1.5 text-[13px]"
                  >
                    {emailAddr}
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: "REMOVE_EMAIL", email: emailAddr });
                      }}
                      className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground"
                      aria-label={t("inviteForm.removeEmail", { email: emailAddr })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  ref={emailInputRef}
                  id="invite-email"
                  type="text"
                  disabled={!canInvite || submitting}
                  value={currentInput}
                  onChange={(e) => dispatch({ type: "SET_CURRENT_INPUT", value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === "Enter" || e.key === " " || e.key === "," || e.key === "Tab") {
                      const val = normalizeInviteEmailInput(currentInput).replace(/,+$/, "");
                      if (val) {
                        e.preventDefault();
                        commitEmail(val);
                      } else if (e.key !== "Enter") {
                        e.preventDefault();
                      }
                    } else if (e.key === "Backspace" && !currentInput) {
                      const last = emails[emails.length - 1];
                      if (last) {
                        dispatch({ type: "REMOVE_EMAIL", email: last });
                      }
                    }
                  }}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    if (!text) return;
                    const parts = text.split(/[,;\s\n]+/).filter(Boolean);
                    if (parts.length > 1) {
                      e.preventDefault();
                      const { emailsToAdd, invalidEmail, duplicateEmail } = parseInviteEmailPaste({
                        existingEmails: emails,
                        text,
                      });

                      if (emailsToAdd.length > 0) {
                        dispatch({ type: "ADD_EMAILS", emails: emailsToAdd });
                      }

                      if (invalidEmail) {
                        dispatch({
                          type: "SET_INPUT_ERROR",
                          error: t("errors.invalidEmailInList", { email: invalidEmail }),
                        });
                      } else if (duplicateEmail && emailsToAdd.length === 0) {
                        dispatch({
                          type: "SET_INPUT_ERROR",
                          error: t("errors.duplicateEmail", { email: duplicateEmail }),
                        });
                      }
                    }
                  }}
                  placeholder={emails.length === 0 ? t("inviteForm.emailPlaceholder") : ""}
                  autoComplete="off"
                  className="min-w-[8rem] flex-1 border-none bg-transparent py-0.5 text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
                />
              </div>
              {inputError ? <p className="mt-1 text-xs text-destructive">{inputError}</p> : null}
            </div>
            <div className="flex flex-row items-end gap-3 sm:shrink-0">
              <div className="min-w-0">
                <Label className="mb-1 block text-xs">{t("inviteForm.roleLabel")}</Label>
                <Select
                  disabled={!canInvite || submitting}
                  value={role}
                  onValueChange={(value) =>
                    dispatch({
                      type: "SET_FIELD",
                      field: "role",
                      value: value as "member" | "admin" | "owner",
                    })
                  }
                >
                  <SelectTrigger className="h-10 w-[8.5rem] min-w-0 py-0 data-[size=default]:h-10">
                    <SelectValue>{getRoleLabel(role)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent sideOffset={2}>
                    <SelectItem value="member">{tCommon("teamRoles.member")}</SelectItem>
                    <SelectItem value="admin">{tCommon("teamRoles.admin")}</SelectItem>
                    {currentUserRole === "owner" ? (
                      <SelectItem value="owner">{tCommon("teamRoles.owner")}</SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
              <SubmitButton
                className="h-10 min-w-0 px-4 py-2 text-sm sm:min-w-[7.5rem]"
                loading={submitting}
                disabled={!canInvite || (emails.length === 0 && !currentInput.trim())}
                pendingLabel={t("actions.sending")}
                idleLabel={
                  emails.length + (currentInput.trim() ? 1 : 0) > 1
                    ? t("actions.sendInvites", {
                        count: emails.length + (currentInput.trim() ? 1 : 0),
                      })
                    : t("actions.sendInvite")
                }
              />
            </div>
          </div>
        </form>

        {seatPriceLabel && canInvite ? (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {t("pricing.perSeat", { amount: seatPriceLabel })}
          </p>
        ) : null}

        {!canInvite ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("permissions.onlyOwnersAdmins")}</p>
        ) : null}

        <FormMessage status={banner.variant} message={banner.message} />
      </DashboardPageSection>

      <DashboardPageSection
        icon={Users}
        title={t("members.title")}
        description={t("members.description")}
      >
        {showPeopleEmptyState ? (
          <p
            className="flex min-h-[5.5rem] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground"
            role="status"
          >
            {members.length === 0 ? t("members.emptyList") : t("members.noOtherMembers")}
          </p>
        ) : (
          <div
            className="rounded-lg border border-border bg-muted/30 p-2"
            aria-label={t("members.title")}
          >
            <ul className="space-y-1.5">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex flex-col gap-2 rounded-md px-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Avatar className="ring-1 ring-border" aria-hidden>
                      <AvatarImage src={member.avatarUrl ?? ""} alt="" />
                      <AvatarFallback className="bg-muted/80 text-[11px] font-semibold text-foreground">
                        {memberInitials(member.fullName, member.userId)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {member.fullName?.trim() || t("members.unnamed")}
                      </p>
                      {member.email ? (
                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pl-10 sm:pl-0">
                    {canManageRole(member) || canRemoveMember(member) ? (
                      <div className="w-fit min-w-0 max-w-full shrink-0">
                        <Select
                          value={
                            member.role === "owner"
                              ? "owner"
                              : member.role === "admin"
                                ? "admin"
                                : "member"
                          }
                          aria-busy={updatingRoleUserId === member.userId}
                          disabled={updatingRoleUserId !== null || removingUserId !== null}
                          onValueChange={(value) => {
                            if (value === "remove") {
                              setRemoveDialogUserId(member.userId);
                              return;
                            }
                            if (!canManageRole(member)) {
                              return;
                            }
                            const next = value as "member" | "admin" | "owner";
                            const current = member.role;
                            if (next === current) {
                              return;
                            }
                            void updateMemberRole(member.userId, next);
                          }}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-fit max-w-full min-w-0 justify-start gap-1.5 border-border/80 px-2.5 py-0 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[size=sm]:h-8 [&_[data-slot=select-value]]:gap-0 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
                            aria-label={t("members.actionsSelectAriaLabel", {
                              name:
                                member.fullName?.trim() ||
                                member.email?.trim() ||
                                t("members.unnamed"),
                            })}
                          >
                            <SelectValue className="min-w-0 flex-none text-inherit">
                              {updatingRoleUserId === member.userId
                                ? t("actions.saving")
                                : removingUserId === member.userId
                                  ? t("actions.removing")
                                  : getRoleLabel(
                                      member.role === "owner"
                                        ? "owner"
                                        : member.role === "admin"
                                          ? "admin"
                                          : "member",
                                    )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent sideOffset={2}>
                            {canManageRole(member) ? (
                              <>
                                <SelectItem value="member">
                                  {tCommon("teamRoles.member")}
                                </SelectItem>
                                <SelectItem value="admin">{tCommon("teamRoles.admin")}</SelectItem>
                              </>
                            ) : null}
                            {!canManageRole(member) &&
                            member.role === "owner" &&
                            canRemoveMember(member) ? (
                              <SelectItem value="owner" disabled>
                                {tCommon("teamRoles.owner")}
                              </SelectItem>
                            ) : null}
                            {canRemoveMember(member) &&
                            (canManageRole(member) || member.role === "owner") ? (
                              <SelectSeparator />
                            ) : null}
                            {canRemoveMember(member) ? (
                              <SelectItem
                                value="remove"
                                data-variant="destructive"
                                className="text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive focus:bg-destructive/10 focus:text-destructive"
                              >
                                {t("actions.remove")}
                              </SelectItem>
                            ) : null}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="capitalize">
                        {getRoleLabel(member.role)}
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DashboardPageSection>

      <DashboardPageSection icon={Clock} title={t("pending.title")}>
        {pendingInvites.length === 0 ? (
          <p className="flex min-h-[5.5rem] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
            {t("pending.none")}
          </p>
        ) : (
          <ul className="space-y-2" aria-label={t("pending.title")}>
            {pendingInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
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
                  <Badge variant="secondary" className="capitalize">
                    {getRoleLabel(invite.role)}
                  </Badge>
                  {canInvite ? (
                    <div className="inline-flex items-center gap-0 text-xs">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={resendInviteId !== null || revokeInviteId !== null}
                        onClick={() => resendInvite(invite.id)}
                        className="cursor-pointer px-1.5 text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent disabled:cursor-not-allowed"
                      >
                        {resendInviteId === invite.id
                          ? t("actions.resending")
                          : t("actions.resend")}
                      </Button>
                      <span className="select-none text-muted-foreground/50" aria-hidden>
                        |
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={revokeInviteId !== null || resendInviteId !== null}
                        onClick={() => void revokeInvite(invite.id)}
                        className="cursor-pointer px-1.5 text-destructive hover:bg-transparent hover:text-[color-mix(in_oklch,var(--destructive)_82%,black)] dark:hover:bg-transparent dark:hover:text-[color-mix(in_oklch,var(--destructive)_88%,black)] disabled:cursor-not-allowed"
                      >
                        {revokeInviteId === invite.id ? t("actions.revoking") : t("actions.revoke")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DashboardPageSection>

      <AlertDialog
        open={removeDialogUserId !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveDialogUserId(null);
        }}
      >
        <AlertDialogContent size="lg">
          <AlertDialogHeader className="gap-3">
            <AlertDialogMedia className="mb-0 size-12 rounded-xl bg-destructive/10 text-destructive ring-1 ring-destructive/15 dark:ring-destructive/25">
              <UserMinus className="size-7" strokeWidth={2} aria-hidden />
            </AlertDialogMedia>
            <AlertDialogTitle className="text-lg font-semibold tracking-tight text-foreground">
              {t("confirmations.removeMemberTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed text-muted-foreground">
              {t("confirmations.removeMember")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="control">{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              size="control"
              onClick={() => {
                if (!removeDialogUserId) return;
                const id = removeDialogUserId;
                setRemoveDialogUserId(null);
                void removeMember(id);
              }}
            >
              {t("actions.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
