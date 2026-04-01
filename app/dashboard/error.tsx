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
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6">
      <Card className="mx-auto mt-16 max-w-md text-center shadow-sm">
        <CardContent className="flex flex-col items-center gap-4 pt-6 pb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Dashboard error</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Something went wrong while loading your dashboard.
            </p>
          </div>
          <Button onClick={reset} className="mt-2">
            Try again
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
