type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  msg: string;
  time: string;
  [key: string]: unknown;
};

const IS_PRODUCTION = process.env.NODE_ENV === "production";

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      err: {
        name: error.name,
        message: error.message,
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
    if (!IS_PRODUCTION) {
      const args: unknown[] = [message];
      if (error != null) args.push(error);
      if (context && Object.keys(context).length > 0) args.push(context);
      console.error(...args);
      return;
    }
    const errorContext = error != null ? serializeError(error) : {};
    emitStructured("error", message, { ...errorContext, ...context });
  },
};
