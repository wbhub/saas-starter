"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

const SENTRY_ENABLED = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

function toSafeSentryError(error: Error): Error {
  const safeError = new Error(error.message);
  safeError.name = error.name;
  if (error.stack) {
    safeError.stack = error.stack;
  }
  return safeError;
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global app error:", error);
    if (SENTRY_ENABLED) {
      Sentry.captureException(toSafeSentryError(error), {
        extra: {
          digest: error.digest,
        },
      });
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-3xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. Please try again.
          </p>
          <Button type="button" size="control" onClick={() => reset()}>
            Try again
          </Button>
        </main>
      </body>
    </html>
  );
}
