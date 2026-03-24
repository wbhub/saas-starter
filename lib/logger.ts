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
const SENTRY_CONTEXT_MAX_DEPTH = 4;
const SENTRY_CONTEXT_MAX_KEYS = 50;
const SENTRY_CONTEXT_MAX_ARRAY_ITEMS = 20;
const SENSITIVE_CONTEXT_KEY_RE =
  /(authorization|cookie|token|secret|password|api[-_]?key|session|set-cookie)/i;
const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /sk_(?:test|live)_[A-Za-z0-9]+/g,
  /pk_(?:test|live)_[A-Za-z0-9]+/g,
  /whsec_[A-Za-z0-9]+/g,
  /re_[A-Za-z0-9]+/g,
  /sk-proj-[A-Za-z0-9_-]+/g,
  /(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi,
];

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

function toSafeSentryError(error: Error): Error {
  const safeError = new Error(redactSensitiveString(error.message));
  safeError.name = error.name;
  if (error.stack) {
    safeError.stack = redactSensitiveString(error.stack);
  }
  return safeError;
}

function redactSensitiveString(value: string): string {
  return SENSITIVE_VALUE_PATTERNS.reduce((acc, pattern) => {
    if (pattern.source.startsWith("(Bearer\\s+)")) {
      return acc.replace(pattern, "$1[Redacted]");
    }
    return acc.replace(pattern, "[Redacted]");
  }, value);
}

function sanitizeForSentry(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    if (typeof value === "string") {
      return redactSensitiveString(value);
    }
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveString(value.message),
      stack: value.stack ? redactSensitiveString(value.stack) : undefined,
    };
  }

  if (depth >= SENTRY_CONTEXT_MAX_DEPTH) {
    return "[Truncated]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, SENTRY_CONTEXT_MAX_ARRAY_ITEMS)
      .map((item) => sanitizeForSentry(item, depth + 1, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);

    const output: Record<string, unknown> = {};
    for (const [index, [key, nestedValue]] of Object.entries(value).entries()) {
      if (index >= SENTRY_CONTEXT_MAX_KEYS) break;
      if (SENSITIVE_CONTEXT_KEY_RE.test(key)) {
        output[key] = "[Redacted]";
        continue;
      }
      output[key] = sanitizeForSentry(nestedValue, depth + 1, seen);
    }
    seen.delete(value);
    return output;
  }

  return String(value);
}

function emitStructured(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const safeMessage = redactSensitiveString(message);
  const safeContext = context ? (sanitizeForSentry(context) as Record<string, unknown>) : undefined;
  const entry: LogEntry = {
    level,
    msg: safeMessage,
    time: new Date().toISOString(),
    ...safeContext,
  };

  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  fn(JSON.stringify(entry));
}

function reportToSentry(message: string, error?: unknown, context?: Record<string, unknown>) {
  if (!SENTRY_ENABLED) {
    return;
  }

  Sentry.withScope((scope) => {
    const safeMessage = redactSensitiveString(message);

    if (context) {
      scope.setContext("logger", sanitizeForSentry(context) as Record<string, unknown>);
    }

    if (error instanceof Error) {
      Sentry.captureException(toSafeSentryError(error), {
        extra: {
          error: sanitizeForSentry(error),
        },
      });
      return;
    }

    if (error && typeof error === "object") {
      Sentry.captureMessage(safeMessage, {
        level: "error",
        extra: { error: sanitizeForSentry(error) },
      });
      return;
    }

    if (error != null) {
      Sentry.captureMessage(redactSensitiveString(`${message}: ${String(error)}`), "error");
      return;
    }

    Sentry.captureMessage(safeMessage, "error");
  });
}

export const logger = {
  info(message: string, context?: Record<string, unknown>) {
    const safeMessage = redactSensitiveString(message);
    const safeContext = context
      ? (sanitizeForSentry(context) as Record<string, unknown>)
      : undefined;
    if (!IS_PRODUCTION) {
      if (safeContext) {
        console.log(safeMessage, safeContext);
      } else {
        console.log(safeMessage);
      }
      return;
    }
    emitStructured("info", safeMessage, safeContext);
  },

  warn(message: string, context?: Record<string, unknown>) {
    const safeMessage = redactSensitiveString(message);
    const safeContext = context
      ? (sanitizeForSentry(context) as Record<string, unknown>)
      : undefined;
    if (!IS_PRODUCTION) {
      if (safeContext) {
        console.warn(safeMessage, safeContext);
      } else {
        console.warn(safeMessage);
      }
      return;
    }
    emitStructured("warn", safeMessage, safeContext);
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

    const safeMessage = redactSensitiveString(message);
    const safeError =
      resolvedError == null
        ? undefined
        : resolvedError instanceof Error
          ? toSafeSentryError(resolvedError)
          : sanitizeForSentry(resolvedError);
    const safeContext = resolvedContext
      ? (sanitizeForSentry(resolvedContext) as Record<string, unknown>)
      : undefined;

    if (!IS_PRODUCTION) {
      const args: unknown[] = [safeMessage];
      if (safeError != null) args.push(safeError);
      if (safeContext && Object.keys(safeContext).length > 0) args.push(safeContext);
      console.error(...args);
      return;
    }
    const errorContext =
      safeError != null
        ? (sanitizeForSentry(serializeError(safeError)) as Record<string, unknown>)
        : {};
    emitStructured("error", message, { ...errorContext, ...safeContext });
  },
};
