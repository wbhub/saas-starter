import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const sentryEnvironment =
  process.env.SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;

if (dsn) {
  Sentry.init({
    dsn,
    environment: sentryEnvironment,
    sendDefaultPii: false,
  });
}
