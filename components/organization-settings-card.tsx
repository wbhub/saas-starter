"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getCsrfHeaders } from "@/lib/http/csrf";
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
    () => members.filter((member) => member.userId !== currentUserId && member.role !== "owner"),
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
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        ok?: boolean;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t("errors.updateName"));
      }
      setFeedback(t("feedback.nameUpdated"));
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

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-2 text-muted-foreground">{t("description")}</p>

      <form className="mt-4 space-y-3" onSubmit={saveTeamName}>
        <div>
          <Label className="mb-1">{t("fields.teamName")}</Label>
          <Input
            type="text"
            value={nameValue}
            onChange={(event) => setNameValue(event.target.value)}
            maxLength={80}
            minLength={2}
            disabled={currentUserRole === "member" || savingName}
          />
        </div>
        <SubmitButton
          loading={savingName}
          disabled={currentUserRole === "member"}
          pendingLabel={t("actions.saving")}
          idleLabel={t("actions.saveOrganization")}
        />
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
              <SelectTrigger className="w-full">
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

      <FormMessage status="success" message={feedback} />
      <FormMessage status="error" message={error} />
    </section>
  );
}
