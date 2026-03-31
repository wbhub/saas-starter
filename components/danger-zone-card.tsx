"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { deleteAccount, logoutAllSessions, type DeleteAccountState } from "@/app/dashboard/actions";
import { DashboardPageSection } from "@/components/dashboard-page-section";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: DeleteAccountState = {
  status: "idle",
  message: null,
};

type DangerZoneCardProps = {
  email: string | null;
  csrfToken: string;
};

export function DangerZoneCard({ email, csrfToken }: DangerZoneCardProps) {
  const t = useTranslations("DangerZoneCard");
  const [state, formAction] = useActionState(deleteAccount, initialState);

  return (
    <DashboardPageSection
      icon={AlertTriangle}
      variant="destructive"
      title={t("title")}
      description={t("description")}
    >
      <div className="rounded-lg border border-destructive/20 bg-destructive/[0.04] p-4 dark:border-destructive/35 dark:bg-destructive/[0.08]">
        <form action={logoutAllSessions}>
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <Button
            type="submit"
            variant="outline"
            className="h-10 min-h-10 border-destructive/35 px-4 py-2 text-destructive"
          >
            {t("actions.deactivate")}
          </Button>
        </form>
      </div>

      <Separator className="mt-6" />

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="csrf_token" value={csrfToken} />
        <div>
          <Label className="mb-1">{t("fields.confirmDelete")}</Label>
          <Input
            name="confirmDelete"
            required
            autoComplete="off"
            placeholder={t("fields.deleteToken")}
          />
        </div>
        <div>
          <Label className="mb-1">{t("fields.confirmEmail")}</Label>
          <Input
            type="email"
            name="confirmEmail"
            required
            autoComplete="off"
            placeholder={email ?? t("fields.confirmEmailPlaceholder")}
          />
        </div>
        <Label className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-background/80 p-3 text-sm font-normal dark:border-destructive/35">
          <Checkbox name="confirmUnderstood" required className="mt-0.5" />
          <span>{t("fields.confirmPermanent")}</span>
        </Label>
        <SubmitButton
          variant="danger"
          pendingLabel={t("actions.deleting")}
          idleLabel={t("actions.deletePermanently")}
          className="h-10 min-h-10 px-4 py-2"
        />
      </form>

      {state.message ? (
        <p
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            state.status === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </DashboardPageSection>
  );
}
