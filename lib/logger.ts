import * as Sentry from "@sentry/nextjs";

type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  msg: string;
  time: string;
  [key: string]: unknown;
};

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const SENTRY_ENABLED = Boolean(SENTRY_DSN);

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      err: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    };
  }
  if (error && typeof error === "object") {
    return { err: error };
  }
  return { err: String(error) };
}

function emitStructured(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    msg: message,
    time: new Date().toISOString(),
    ...context,
  };

  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;

  fn(JSON.stringify(entry));
}

function reportToSentry(
  message: string,
  error?: unknown,
  context?: Record<string, unknown>,
) {
  if (!SENTRY_ENABLED) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext("logger", context);
    }

    if (error instanceof Error) {
      Sentry.captureException(error);
      return;
    }

    if (error && typeof error === "object") {
      Sentry.captureMessage(message, {
        level: "error",
        extra: { error },
      });
      return;
    }

    if (error != null) {
      Sentry.captureMessage(`${message}: ${String(error)}`, "error");
      return;
    }

    Sentry.captureMessage(message, "error");
  });
}

export const logger = {
  info(message: string, context?: Record<string, unknown>) {
    if (!IS_PRODUCTION) {
      if (context) {
        console.log(message, context);
      } else {
        console.log(message);
      }
      return;
    }
    emitStructured("info", message, context);
  },

  warn(message: string, context?: Record<string, unknown>) {
    if (!IS_PRODUCTION) {
      if (context) {
        console.warn(message, context);
      } else {
        console.warn(message);
      }
      return;
    }
    emitStructured("warn", message, context);
  },

  error(message: string, error?: unknown, context?: Record<string, unknown>) {
    // Detect call-sites that pass a plain context object as the second arg
    // instead of an Error (e.g. logger.error("msg", { teamId, error })).
    // When no third arg is given and the second arg is a plain object without
    // typical Error-like properties, treat it as structured context so it
    // serializes into queryable fields rather than a noisy `err` blob.
    let resolvedError = error;
    let resolvedContext = context;
    if (
      context === undefined &&
      error != null &&
      typeof error === "object" &&
      !(error instanceof Error) &&
      !("message" in error && "stack" in error)
    ) {
      resolvedError = undefined;
      resolvedContext = error as Record<string, unknown>;
    }

    reportToSentry(message, resolvedError, resolvedContext);

    if (!IS_PRODUCTION) {
      const args: unknown[] = [message];
      if (resolvedError != null) args.push(resolvedError);
      if (resolvedContext && Object.keys(resolvedContext).length > 0) args.push(resolvedContext);
      console.error(...args);
      return;
    }
    const errorContext = resolvedError != null ? serializeError(resolvedError) : {};
    emitStructured("error", message, { ...errorContext, ...resolvedContext });
  },
};
