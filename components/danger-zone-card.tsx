"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { deleteAccount, logoutAllSessions, type DeleteAccountState } from "@/app/dashboard/actions";

const initialState: DeleteAccountState = {
  status: "idle",
  message: null,
};

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-60"
    >
      {pending ? "Deleting..." : "Delete account permanently"}
    </button>
  );
}

type DangerZoneCardProps = {
  email: string | null;
};

export function DangerZoneCard({ email }: DangerZoneCardProps) {
  const [state, formAction] = useActionState(deleteAccount, initialState);

  return (
    <section className="rounded-xl border border-rose-300/60 bg-rose-50/60 p-5 shadow-sm dark:border-rose-900/70 dark:bg-rose-950/20">
      <h2 className="text-lg font-semibold text-rose-800 dark:text-rose-200">Danger Zone</h2>
      <p className="mt-2 text-sm text-rose-700/90 dark:text-rose-200/80">
        Deactivation signs you out of all sessions. Deletion permanently removes your account.
      </p>

      <div className="mt-4">
        <form action={logoutAllSessions}>
          <button
            type="submit"
            className="rounded-lg border border-rose-300/80 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/40"
          >
            Deactivate for now (sign out everywhere)
          </button>
        </form>
      </div>

      <form action={formAction} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-rose-800 dark:text-rose-100">
            Type DELETE to confirm
          </span>
          <input
            name="confirmDelete"
            required
            autoComplete="off"
            className="w-full rounded-lg border border-rose-300/80 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-rose-400/50 placeholder:text-slate-500 focus:ring-2 dark:border-rose-800 dark:bg-rose-950/30 dark:text-slate-50 dark:placeholder:text-slate-400"
            placeholder="DELETE"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-rose-800 dark:text-rose-100">
            Confirm your email address
          </span>
          <input
            type="email"
            name="confirmEmail"
            required
            autoComplete="off"
            placeholder={email ?? "you@example.com"}
            className="w-full rounded-lg border border-rose-300/80 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-rose-400/50 placeholder:text-slate-500 focus:ring-2 dark:border-rose-800 dark:bg-rose-950/30 dark:text-slate-50 dark:placeholder:text-slate-400"
          />
        </label>
        <label className="flex items-start gap-2 rounded-lg border border-rose-300/80 p-3 text-sm text-rose-800 dark:border-rose-800 dark:text-rose-100">
          <input
            type="checkbox"
            name="confirmUnderstood"
            required
            className="mt-0.5 h-4 w-4 rounded border border-rose-400 bg-transparent"
          />
          <span>I understand this action is permanent and cannot be undone.</span>
        </label>
        <DeleteButton />
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
