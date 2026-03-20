"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateDashboardSettings,
  type UpdateDashboardSettingsState,
} from "@/app/dashboard/actions";

type DashboardSettingsCardProps = {
  fullName: string | null;
  email: string | null;
};

const initialState: UpdateDashboardSettingsState = {
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
      {pending ? "Saving..." : "Save settings"}
    </button>
  );
}

export function DashboardSettingsCard({ fullName, email }: DashboardSettingsCardProps) {
  const [state, formAction] = useActionState(updateDashboardSettings, initialState);

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Settings</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Update your basic account settings.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
            Display name
          </span>
          <input
            type="text"
            name="fullName"
            maxLength={80}
            defaultValue={fullName ?? ""}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-slate-900 outline-none ring-[color:var(--ring)] placeholder:text-slate-500 focus:ring-2 dark:text-slate-50 dark:placeholder:text-slate-400"
            placeholder="Your name"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
            Email
          </span>
          <input
            type="email"
            value={email ?? ""}
            readOnly
            className="w-full rounded-lg border app-border-subtle app-surface-subtle px-3 py-2 text-sm text-slate-600 outline-none dark:text-slate-300"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Email is managed in your authentication provider.
          </p>
        </label>

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
