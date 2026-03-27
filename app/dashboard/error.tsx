"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
    console.error("Dashboard rendering failed:", error);
    if (SENTRY_ENABLED) {
      Sentry.captureException(toSafeSentryError(error));
    }
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-sm text-center">
        <CardContent className="flex flex-col items-center gap-4 pt-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Dashboard error</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Something went wrong while loading your dashboard.
            </p>
          </div>
          <Button onClick={reset} size="sm">
            Try again
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
