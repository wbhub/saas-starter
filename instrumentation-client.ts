import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const SENTRY_ENABLED = Boolean(dsn);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT,
  });
}

export const onRouterTransitionStart = SENTRY_ENABLED
  ? Sentry.captureRouterTransitionStart
  : () => {};
