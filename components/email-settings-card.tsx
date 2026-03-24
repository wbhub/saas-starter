"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { requestEmailChange, type RequestEmailChangeState } from "@/app/dashboard/actions";

type EmailSettingsCardProps = {
  email: string | null;
  csrfToken: string;
};

const initialState: RequestEmailChangeState = {
  status: "idle",
  message: null,
};

function SubmitButton({ pendingLabel, idleLabel }: { pendingLabel: string; idleLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-text hover:bg-btn-primary-hover disabled:opacity-60"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function EmailSettingsCard({ email, csrfToken }: EmailSettingsCardProps) {
  const t = useTranslations("EmailSettingsCard");
  const [state, formAction] = useActionState(requestEmailChange, initialState);

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("description")}
      </p>
      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="csrf_token" value={csrfToken} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            {t("fields.currentEmail")}
          </span>
          <input
            type="email"
            readOnly
            value={email ?? ""}
            className="w-full rounded-lg border app-border-subtle app-surface-subtle px-3 py-2 text-sm text-muted-foreground outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            {t("fields.newEmail")}
          </span>
          <input
            type="email"
            name="newEmail"
            required
            autoComplete="email"
            placeholder={t("fields.newEmailPlaceholder")}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
          />
        </label>
        <SubmitButton pendingLabel={t("actions.sending")} idleLabel={t("actions.requestEmailChange")} />
      </form>
      {state.message ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            state.status === "error"
              ? "border border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/30 dark:text-rose-200"
              : "app-surface-subtle text-muted-foreground"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
