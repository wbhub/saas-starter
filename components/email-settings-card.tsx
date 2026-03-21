"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { requestEmailChange, type RequestEmailChangeState } from "@/app/dashboard/actions";

type EmailSettingsCardProps = {
  email: string | null;
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
      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function EmailSettingsCard({ email }: EmailSettingsCardProps) {
  const t = useTranslations("EmailSettingsCard");
  const [state, formAction] = useActionState(requestEmailChange, initialState);

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{t("title")}</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {t("description")}
      </p>
      <form action={formAction} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
            {t("fields.currentEmail")}
          </span>
          <input
            type="email"
            readOnly
            value={email ?? ""}
            className="w-full rounded-lg border app-border-subtle app-surface-subtle px-3 py-2 text-sm text-slate-600 outline-none dark:text-slate-300"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
            {t("fields.newEmail")}
          </span>
          <input
            type="email"
            name="newEmail"
            required
            autoComplete="email"
            placeholder={t("fields.newEmailPlaceholder")}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-slate-900 outline-none ring-[color:var(--ring)] placeholder:text-slate-500 focus:ring-2 dark:text-slate-50 dark:placeholder:text-slate-400"
          />
        </label>
        <SubmitButton pendingLabel={t("actions.sending")} idleLabel={t("actions.requestEmailChange")} />
      </form>
      {state.message ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            state.status === "error"
              ? "border border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/30 dark:text-rose-200"
              : "app-surface-subtle text-slate-700 dark:text-slate-200"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
