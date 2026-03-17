"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center">
        <h2 className="text-xl font-semibold text-slate-900">Dashboard error</h2>
        <p className="mt-2 text-sm text-slate-600">{error.message}</p>
        <button
          onClick={reset}
          className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
