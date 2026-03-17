"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-4 text-[color:var(--foreground)]">
      <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center dark:border-red-500/60 dark:bg-slate-900">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
          Dashboard error
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {error.message}
        </p>
        <button
          onClick={reset}
          className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
