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

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Keep full details in the browser console for debugging.
    console.error("Dashboard rendering failed:", error);
    if (SENTRY_ENABLED) {
      Sentry.captureException(toSafeSentryError(error));
    }
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-4 text-[color:var(--foreground)]">
      <div className="max-w-md rounded-2xl border border-red-200 app-surface p-8 text-center shadow-sm dark:border-red-500/30">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10">
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-foreground">Dashboard error</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong while loading your dashboard. Please try again.
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-btn-primary px-5 py-2.5 text-sm font-medium text-btn-primary-text transition-colors hover:bg-btn-primary-hover"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
