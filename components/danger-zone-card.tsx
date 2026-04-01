"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, LogOut, Trash2 } from "lucide-react";
import { deleteAccount, logoutAllSessions, type DeleteAccountState } from "@/app/dashboard/actions";
import { DashboardPageSection } from "@/components/dashboard-page-section";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

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
      <div className="space-y-6">
        <div className="rounded-xl border border-border/80 bg-background/70 p-4 shadow-sm ring-1 ring-border/40 dark:bg-background/30">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="flex min-w-0 gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/90 text-muted-foreground ring-1 ring-border/60"
                aria-hidden
              >
                <LogOut className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-semibold leading-tight text-foreground">
                  {t("deactivate.title")}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("deactivate.hint")}
                </p>
              </div>
            </div>
            <form
              action={logoutAllSessions}
              className="flex shrink-0 sm:max-w-[min(100%,14rem)] sm:flex-1 sm:justify-end"
            >
              <input type="hidden" name="csrf_token" value={csrfToken} />
              <Button type="submit" variant="outline" size="control" className="w-full sm:w-auto">
                {t("actions.deactivate")}
              </Button>
            </form>
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-background/70 p-4 shadow-sm ring-1 ring-border/40 dark:bg-background/30">
          <div className="mb-5 flex gap-3 sm:mb-6">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/12 text-destructive ring-1 ring-destructive/20"
              aria-hidden
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="text-sm font-semibold leading-tight text-foreground">
                {t("delete.title")}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{t("delete.hint")}</p>
            </div>
          </div>

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="danger-confirm-delete" className="text-foreground">
                  {t("fields.confirmDelete")}
                </Label>
                <Input
                  id="danger-confirm-delete"
                  name="confirmDelete"
                  required
                  autoComplete="off"
                  placeholder={t("fields.deleteToken")}
                  className="bg-background/80 dark:bg-background/60"
                />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="danger-confirm-email" className="text-foreground">
                  {t("fields.confirmEmail")}
                </Label>
                <Input
                  id="danger-confirm-email"
                  type="email"
                  name="confirmEmail"
                  required
                  autoComplete="off"
                  placeholder={email ?? t("fields.confirmEmailPlaceholder")}
                  className="bg-background/80 dark:bg-background/60"
                />
              </div>
            </div>

            <Label
              htmlFor="danger-confirm-understood"
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border border-destructive/20 bg-background/90 p-3.5 text-sm font-normal leading-snug shadow-sm",
                "transition-colors hover:bg-background dark:border-destructive/30 dark:bg-background/70 dark:hover:bg-background/90",
              )}
            >
              <Checkbox
                id="danger-confirm-understood"
                name="confirmUnderstood"
                required
                className="mt-0.5"
              />
              <span className="text-foreground/90">{t("fields.confirmPermanent")}</span>
            </Label>

            <div className="pt-1">
              <SubmitButton
                variant="danger"
                pendingLabel={t("actions.deleting")}
                idleLabel={t("actions.deletePermanently")}
                className="h-11 min-h-11 w-full px-4 py-2 sm:w-auto sm:min-w-[12rem]"
              />
            </div>

            <FormMessage status={state.status} message={state.message} />
          </form>
        </div>
      </div>
    </DashboardPageSection>
  );
}
