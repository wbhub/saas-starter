"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { DashboardPageSection } from "@/components/dashboard-page-section";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Separator } from "@/components/ui/separator";

type TeamMember = {
  userId: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: "owner" | "admin" | "member";
};

type OrganizationSettingsCardProps = {
  teamName: string;
  members: TeamMember[];
  currentUserId: string;
  currentUserRole: "owner" | "admin" | "member";
};

const TEAM_NAME_AUTOSAVE_MS = 600;

export function OrganizationSettingsCard({
  teamName,
  members,
  currentUserId,
  currentUserRole,
}: OrganizationSettingsCardProps) {
  const t = useTranslations("OrganizationSettingsCard");
  const router = useRouter();

  const [nameInput, setNameInput] = useState(teamName);
  const nameRef = useRef(teamName);
  const nameDirtyRef = useRef(false);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameSavedIndicatorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const namePersistRef = useRef(false);
  const [nameSaveStatus, setNameSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [nameError, setNameError] = useState<string | null>(null);

  const [transferring, setTransferring] = useState(false);
  const [nextOwnerUserId, setNextOwnerUserId] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ownershipCandidates = useMemo(
    () => members.filter((member) => member.userId !== currentUserId && member.role !== "owner"),
    [members, currentUserId],
  );

  useEffect(() => {
    nameRef.current = nameInput;
  }, [nameInput]);

  useEffect(() => {
    if (nameDirtyRef.current) {
      return;
    }
    setNameInput(teamName);
    nameRef.current = teamName;
  }, [teamName]);

  useEffect(
    () => () => {
      if (nameDebounceRef.current) {
        clearTimeout(nameDebounceRef.current);
      }
      if (nameSavedIndicatorRef.current) {
        clearTimeout(nameSavedIndicatorRef.current);
      }
    },
    [],
  );

  function serverTeamNameNormalized() {
    return teamName.trim();
  }

  function scheduleTeamNameAutosave() {
    if (nameDebounceRef.current) {
      clearTimeout(nameDebounceRef.current);
    }
    nameDebounceRef.current = setTimeout(() => {
      nameDebounceRef.current = null;
      void persistTeamName();
    }, TEAM_NAME_AUTOSAVE_MS);
  }

  async function saveTeamNameOnce(): Promise<void> {
    const normalized = nameRef.current.trim();
    if (normalized.length < 2) {
      return;
    }
    if (normalized === serverTeamNameNormalized()) {
      nameDirtyRef.current = false;
      setNameSaveStatus("idle");
      return;
    }

    setNameSaveStatus("saving");
    setNameError(null);

    const response = await fetch("/api/team/settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getCsrfHeaders(),
      },
      body: JSON.stringify({ teamName: normalized }),
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      ok?: boolean;
    } | null;
    if (!response.ok) {
      throw new Error(payload?.error ?? t("errors.updateName"));
    }

    const latest = nameRef.current.trim();
    if (latest !== normalized) {
      await saveTeamNameOnce();
      return;
    }

    nameDirtyRef.current = false;
    if (nameSavedIndicatorRef.current) {
      clearTimeout(nameSavedIndicatorRef.current);
    }
    setNameSaveStatus("saved");
    nameSavedIndicatorRef.current = setTimeout(() => {
      nameSavedIndicatorRef.current = null;
      setNameSaveStatus("idle");
    }, 2000);
    router.refresh();
  }

  async function persistTeamName() {
    if (currentUserRole === "member" || namePersistRef.current) {
      return;
    }
    const normalized = nameRef.current.trim();
    if (normalized.length < 2) {
      return;
    }
    if (normalized === serverTeamNameNormalized()) {
      nameDirtyRef.current = false;
      setNameSaveStatus("idle");
      return;
    }

    namePersistRef.current = true;
    try {
      await saveTeamNameOnce();
    } catch (submitError) {
      setNameSaveStatus("idle");
      setNameError(submitError instanceof Error ? submitError.message : t("errors.updateName"));
    } finally {
      namePersistRef.current = false;
    }
  }

  function handleTeamNameBlur() {
    if (nameDebounceRef.current) {
      clearTimeout(nameDebounceRef.current);
      nameDebounceRef.current = null;
    }
    const normalized = nameRef.current.trim();
    if (normalized.length > 0 && normalized.length < 2) {
      setNameError(t("errors.teamNameTooShort"));
      setNameSaveStatus("idle");
      return;
    }
    setNameError(null);
    if (normalized.length >= 2) {
      void persistTeamName();
    }
  }

  async function transferOwnership() {
    if (!nextOwnerUserId) {
      setError(t("errors.selectTeammate"));
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
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        ok?: boolean;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.transferOwnership"));
      }
      setFeedback(t("feedback.ownershipTransferred"));
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("errors.transferOwnership"));
    } finally {
      setTransferring(false);
    }
  }

  const canEditTeamName = currentUserRole !== "member";

  return (
    <DashboardPageSection icon={Building2} title={t("title")} description={t("description")}>
      <div className="space-y-6">
        <div>
          <Label className="mb-1 block" htmlFor="settings-team-name">
            {t("fields.teamName")}
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Input
              id="settings-team-name"
              type="text"
              value={nameInput}
              onChange={(event) => {
                const value = event.target.value;
                nameRef.current = value;
                nameDirtyRef.current = true;
                setNameInput(value);
                setNameError(null);
                if (nameSaveStatus === "saved") {
                  setNameSaveStatus("idle");
                }
                scheduleTeamNameAutosave();
              }}
              onBlur={handleTeamNameBlur}
              maxLength={80}
              minLength={2}
              disabled={!canEditTeamName}
              autoComplete="organization"
              aria-busy={nameSaveStatus === "saving"}
              className="h-10 min-h-10 w-full min-w-0 max-w-md py-2"
            />
            {nameSaveStatus === "saving" || nameSaveStatus === "saved" ? (
              <p
                className="min-h-[1.25rem] text-xs font-medium leading-none text-muted-foreground sm:min-w-[5.5rem]"
                aria-live="polite"
              >
                {nameSaveStatus === "saving" ? t("actions.saving") : t("fields.nameSaved")}
              </p>
            ) : null}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t("fields.teamNameAutosave")}
          </p>
          {nameError ? <p className="mt-2 text-xs text-destructive">{nameError}</p> : null}
        </div>

        {currentUserRole === "owner" ? (
          <>
            <Separator />
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground">{t("ownership.title")}</h3>
              <div>
                <Label className="mb-1 text-muted-foreground">{t("ownership.newOwner")}</Label>
                <Select
                  value={nextOwnerUserId}
                  onValueChange={(value) => setNextOwnerUserId(value ?? "")}
                  disabled={transferring || ownershipCandidates.length === 0}
                >
                  <SelectTrigger className="h-10 w-full min-w-0 py-0 data-[size=default]:h-10">
                    <SelectValue placeholder={t("ownership.selectTeammate")} />
                  </SelectTrigger>
                  <SelectContent>
                    {ownershipCandidates.map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {(member.fullName?.trim() || member.email || member.userId) +
                          ` (${member.role})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ConfirmDialog
                title={t("ownership.title")}
                description={t("confirm.transferOwnership")}
                confirmLabel={t("actions.transferOwnership")}
                cancelLabel={t("actions.cancel")}
                onConfirm={() => transferOwnership()}
              >
                <Button
                  type="button"
                  variant="outline"
                  disabled={transferring || !nextOwnerUserId}
                  size="control"
                  className="border-warning/40 text-warning-foreground hover:bg-warning/10 dark:text-warning dark:hover:bg-warning/15"
                >
                  {transferring ? t("actions.transferring") : t("actions.transferOwnership")}
                </Button>
              </ConfirmDialog>
            </div>
          </>
        ) : null}

        <FormMessage status="success" message={feedback} />
        <FormMessage status="error" message={error} />
      </div>
    </DashboardPageSection>
  );
}
