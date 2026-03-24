"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

const SENTRY_ENABLED = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

function toSafeSentryError(error: Error): Error {
  const safeError = new Error(error.message);
  safeError.name = error.name;
  if (error.stack) {
    safeError.stack = error.stack;
  }
  return safeError;
}

export default function DashboardError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    // Keep full details in the browser console for debugging.
    console.error("Dashboard rendering failed:", error);
    if (SENTRY_ENABLED) {
      Sentry.captureException(toSafeSentryError(error));
    }
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-4 text-[color:var(--foreground)]">
      <div className="max-w-md rounded-xl border border-red-200 bg-surface p-6 text-center dark:border-red-500/60">
        <h2 className="text-xl font-semibold text-foreground">
          Dashboard error
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong while loading your dashboard. Please try again.
        </p>
        <button
          onClick={reset}
          className="mt-5 rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-text"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
