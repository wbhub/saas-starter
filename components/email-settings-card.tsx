"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestEmailChange, type RequestEmailChangeState } from "@/app/dashboard/actions";

type EmailSettingsCardProps = {
  email: string | null;
};

const initialState: RequestEmailChangeState = {
  status: "idle",
  message: null,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
    >
      {pending ? "Sending..." : "Request email change"}
    </button>
  );
}

export function EmailSettingsCard({ email }: EmailSettingsCardProps) {
  const [state, formAction] = useActionState(requestEmailChange, initialState);

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Email address</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Request an email update. We will send confirmation instructions based on your auth security settings.
      </p>
      <form action={formAction} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-100">
            Current email
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
            New email
          </span>
          <input
            type="email"
            name="newEmail"
            required
            autoComplete="email"
            placeholder="name@company.com"
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-sm text-slate-900 outline-none ring-[color:var(--ring)] placeholder:text-slate-500 focus:ring-2 dark:text-slate-50 dark:placeholder:text-slate-400"
          />
        </label>
        <SubmitButton />
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
