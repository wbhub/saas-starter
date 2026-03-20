import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const SENTRY_ENABLED = Boolean(dsn);
const sentryEnvironment =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.SENTRY_ENVIRONMENT;

if (dsn) {
  Sentry.init({
    dsn,
    environment: sentryEnvironment,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = SENTRY_ENABLED
  ? Sentry.captureRouterTransitionStart
  : () => {};
