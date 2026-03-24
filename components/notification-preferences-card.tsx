"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import {
  updateNotificationPreferences,
  type UpdateNotificationPreferencesState,
} from "@/app/dashboard/actions";

type NotificationPreferencesCardProps = {
  marketingEmails: boolean;
  productUpdates: boolean;
  securityAlerts: boolean;
  csrfToken: string;
};

const initialState: UpdateNotificationPreferencesState = {
  status: "idle",
  message: null,
};

function SaveButton({ pendingLabel, idleLabel }: { pendingLabel: string; idleLabel: string }) {
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

function PreferenceToggle({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-lg border app-border-subtle px-3 py-2">
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 rounded border app-border-subtle bg-transparent text-foreground focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

export function NotificationPreferencesCard({
  marketingEmails,
  productUpdates,
  securityAlerts,
  csrfToken,
}: NotificationPreferencesCardProps) {
  const t = useTranslations("NotificationPreferencesCard");
  const [state, formAction] = useActionState(updateNotificationPreferences, initialState);

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">
        {t("title")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("description")}
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="csrf_token" value={csrfToken} />
        <PreferenceToggle
          name="securityAlerts"
          label={t("items.securityAlerts.label")}
          description={t("items.securityAlerts.description")}
          defaultChecked={securityAlerts}
        />
        <PreferenceToggle
          name="productUpdates"
          label={t("items.productUpdates.label")}
          description={t("items.productUpdates.description")}
          defaultChecked={productUpdates}
        />
        <PreferenceToggle
          name="marketingEmails"
          label={t("items.marketingEmails.label")}
          description={t("items.marketingEmails.description")}
          defaultChecked={marketingEmails}
        />
        <SaveButton pendingLabel={t("actions.saving")} idleLabel={t("actions.savePreferences")} />
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
