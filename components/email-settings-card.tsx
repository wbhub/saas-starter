"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";
import { requestEmailChange, type RequestEmailChangeState } from "@/app/dashboard/actions";
import { DashboardPageSection } from "@/components/dashboard-page-section";
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
    <DashboardPageSection icon={Mail} title={t("title")} description={t("description")}>
      <div className="space-y-4">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <div>
            <Label className="mb-1">{t("fields.currentEmail")}</Label>
            <Input type="email" variant="readonly" value={email ?? ""} className="max-w-md" />
          </div>
          <div>
            <Label className="mb-1">{t("fields.newEmail")}</Label>
            <Input
              type="email"
              name="newEmail"
              required
              autoComplete="email"
              placeholder={t("fields.newEmailPlaceholder")}
              className="max-w-md"
            />
          </div>
          <SubmitButton
            pendingLabel={t("actions.sending")}
            idleLabel={t("actions.requestEmailChange")}
          />
        </form>
        <FormMessage status={state.status} message={state.message} />
      </div>
    </DashboardPageSection>
  );
}
