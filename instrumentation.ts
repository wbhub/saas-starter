import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import { validateRequiredEnvAtBoot } from "./lib/env";

const SENTRY_ENABLED = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

export async function register() {
  // In development, missing optional third-party keys (Resend, Stripe, etc.) should not
  // prevent `next dev` from starting; routes that need them will error at call sites.
  if (process.env.NEXT_RUNTIME !== "edge" && process.env.NODE_ENV === "production") {
    validateRequiredEnvAtBoot();
  }

  if (!SENTRY_ENABLED) {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError = (...args) => {
  if (!SENTRY_ENABLED) {
    return;
  }
  Sentry.captureRequestError(...args);
};
