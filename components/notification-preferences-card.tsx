"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateNotificationPreferences,
  type UpdateNotificationPreferencesState,
} from "@/app/dashboard/actions";

type NotificationPreferencesCardProps = {
  marketingEmails: boolean;
  productUpdates: boolean;
  securityAlerts: boolean;
};

const initialState: UpdateNotificationPreferencesState = {
  status: "idle",
  message: null,
};

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
    >
      {pending ? "Saving..." : "Save preferences"}
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
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
        <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-300">{description}</span>
      </span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 rounded border app-border-subtle bg-transparent text-slate-900 focus:ring-2 focus:ring-[color:var(--ring)] dark:text-slate-100"
      />
    </label>
  );
}

export function NotificationPreferencesCard({
  marketingEmails,
  productUpdates,
  securityAlerts,
}: NotificationPreferencesCardProps) {
  const [state, formAction] = useActionState(updateNotificationPreferences, initialState);

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
        Notification preferences
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Choose which account emails you want to receive.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <PreferenceToggle
          name="securityAlerts"
          label="Security alerts"
          description="Sign-ins, password resets, and important account activity."
          defaultChecked={securityAlerts}
        />
        <PreferenceToggle
          name="productUpdates"
          label="Product updates"
          description="Feature announcements and release notes."
          defaultChecked={productUpdates}
        />
        <PreferenceToggle
          name="marketingEmails"
          label="Marketing emails"
          description="Tips, offers, and occasional product highlights."
          defaultChecked={marketingEmails}
        />
        <SaveButton />
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
