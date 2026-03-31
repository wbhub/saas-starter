"use client";

import { FormEvent, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Check } from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/components/ui/form-message";

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
  const [showSaved, setShowSaved] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [nextOwnerUserId, setNextOwnerUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ownershipCandidates = useMemo(
    () => members.filter((member) => member.userId !== currentUserId && member.role !== "owner"),
    [members, currentUserId],
  );

  async function saveTeamName(event?: FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    
    // Don't save if the name hasn't changed or is invalid
    if (nameValue === teamName || nameValue.trim().length < 2) return;
    
    setSavingName(true);
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
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        ok?: boolean;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.updateName"));
      }
      
      // Handle the saved indicator directly in the event handler
      setShowSaved(true);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => setShowSaved(false), 2000);
      
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("errors.updateName"));
    } finally {
      setSavingName(false);
    }
  }

  async function transferOwnership() {
    if (!nextOwnerUserId) {
      setError(t("errors.selectTeammate"));
      return;
    }

    setTransferring(true);
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
      
      // Handle the saved indicator directly in the event handler
      setShowSaved(true);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => setShowSaved(false), 2000);
      
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("errors.transferOwnership"));
    } finally {
      setTransferring(false);
    }
  }

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-6 sm:p-8 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-2 text-muted-foreground">{t("description")}</p>

      <form ref={formRef} className="mt-6 space-y-6" onSubmit={saveTeamName}>
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label>{t("fields.teamName")}</Label>
            <div className="flex items-center h-5">
              {savingName && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>{t("actions.saving")}</span>
                </div>
              )}
              {showSaved && !savingName && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3 w-3" />
                  <span>Saved</span>
                </div>
              )}
            </div>
          </div>
          <Input
            type="text"
            value={nameValue}
            onChange={(event) => setNameValue(event.target.value)}
            onBlur={() => saveTeamName()}
            maxLength={80}
            minLength={2}
            disabled={currentUserRole === "member" || savingName}
            className="max-w-md"
          />
        </div>
      </form>

      {currentUserRole === "owner" ? (
        <div className="mt-6 space-y-3 border-t app-border-subtle pt-5">
          <h3 className="text-sm font-medium text-foreground">{t("ownership.title")}</h3>
          <div>
            <Label className="mb-1 text-muted-foreground">{t("ownership.newOwner")}</Label>
            <Select
              value={nextOwnerUserId}
              onValueChange={(value) => setNextOwnerUserId(value ?? "")}
              disabled={transferring || ownershipCandidates.length === 0}
            >
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder={t("ownership.selectTeammate")} />
              </SelectTrigger>
              <SelectContent>
                {ownershipCandidates.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {(member.fullName?.trim() || member.userId) + ` (${member.role})`}
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
              className="border-amber-300/60 text-amber-800 hover:bg-amber-50 dark:border-amber-700/60 dark:text-amber-200 dark:hover:bg-amber-950/30"
            >
              {transferring ? t("actions.transferring") : t("actions.transferOwnership")}
            </Button>
          </ConfirmDialog>
        </div>
      ) : null}

      {error && (
        <div className="mt-4">
          <FormMessage status="error" message={error} />
        </div>
      )}
    </section>
  );
}
