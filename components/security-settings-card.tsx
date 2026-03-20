import Link from "next/link";
import { logoutAllSessions } from "@/app/dashboard/actions";

export function SecuritySettingsCard() {
  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
        Session and security
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Manage account sessions and reset your password.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <form action={logoutAllSessions}>
          <button
            type="submit"
            className="rounded-lg border app-border-subtle px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Sign out all sessions
          </button>
        </form>
        <Link
          href="/forgot-password"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Reset password
        </Link>
      </div>
    </section>
  );
}
