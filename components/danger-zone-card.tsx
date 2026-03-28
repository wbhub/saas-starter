"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { deleteAccount, logoutAllSessions, type DeleteAccountState } from "@/app/dashboard/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
    <section className="rounded-xl border border-rose-300/60 bg-rose-50/60 p-5 shadow-sm dark:border-rose-900/70 dark:bg-rose-950/20">
      <h2 className="text-lg font-semibold text-rose-800 dark:text-rose-200">{t("title")}</h2>
      <p className="mt-2 text-sm text-rose-700/90 dark:text-rose-200/80">{t("description")}</p>

      <div className="mt-4">
        <form action={logoutAllSessions}>
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <Button
            type="submit"
            variant="outline"
            className="border-rose-300/80 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/40"
          >
            {t("actions.deactivate")}
          </Button>
        </form>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="csrf_token" value={csrfToken} />
        <div>
          <Label className="mb-1 text-rose-800 dark:text-rose-100">
            {t("fields.confirmDelete")}
          </Label>
          <Input
            name="confirmDelete"
            required
            autoComplete="off"
            className="border-rose-300/80 bg-white ring-rose-400/50 dark:border-rose-800 dark:bg-rose-950/30"
            placeholder={t("fields.deleteToken")}
          />
        </div>
        <div>
          <Label className="mb-1 text-rose-800 dark:text-rose-100">
            {t("fields.confirmEmail")}
          </Label>
          <Input
            type="email"
            name="confirmEmail"
            required
            autoComplete="off"
            placeholder={email ?? t("fields.confirmEmailPlaceholder")}
            className="border-rose-300/80 bg-white ring-rose-400/50 dark:border-rose-800 dark:bg-rose-950/30"
          />
        </div>
        <Label className="flex items-start gap-2 rounded-lg border border-rose-300/80 p-3 text-sm font-normal text-rose-800 dark:border-rose-800 dark:text-rose-100">
          <Checkbox
            name="confirmUnderstood"
            required
            className="mt-0.5"
          />
          <span>{t("fields.confirmPermanent")}</span>
        </Label>
        <SubmitButton
          variant="danger"
          pendingLabel={t("actions.deleting")}
          idleLabel={t("actions.deletePermanently")}
        />
      </form>

      {state.message ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            state.status === "error"
              ? "border border-rose-300/60 bg-rose-100 text-rose-800 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-100"
              : "border border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
