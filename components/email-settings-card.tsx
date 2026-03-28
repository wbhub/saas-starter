"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { requestEmailChange, type RequestEmailChangeState } from "@/app/dashboard/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormMessage } from "@/components/ui/form-message";

type EmailSettingsCardProps = {
  email: string | null;
  csrfToken: string;
};

const initialState: RequestEmailChangeState = {
  status: "idle",
  message: null,
};

export function EmailSettingsCard({ email, csrfToken }: EmailSettingsCardProps) {
  const t = useTranslations("EmailSettingsCard");
  const [state, formAction] = useActionState(requestEmailChange, initialState);

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-2 text-muted-foreground">{t("description")}</p>
      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="csrf_token" value={csrfToken} />
        <div>
          <Label className="mb-1">{t("fields.currentEmail")}</Label>
          <Input type="email" variant="readonly" value={email ?? ""} />
        </div>
        <div>
          <Label className="mb-1">{t("fields.newEmail")}</Label>
          <Input
            type="email"
            name="newEmail"
            required
            autoComplete="email"
            placeholder={t("fields.newEmailPlaceholder")}
          />
        </div>
        <SubmitButton
          pendingLabel={t("actions.sending")}
          idleLabel={t("actions.requestEmailChange")}
        />
      </form>
      <FormMessage status={state.status} message={state.message} />
    </section>
  );
}
