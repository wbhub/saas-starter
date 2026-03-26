/**
 * Attempts to extract a user-facing error message from an AI SDK error.
 *
 * AI SDK hooks surface provider/route errors as `Error` objects whose
 * `.message` may contain a raw JSON string like `{"error":"...","code":"..."}`.
 * This helper:
 *
 * 1. Checks if the error message is a JSON object with a `code` field that
 *    maps to a translated message in `codeMessages`.
 * 2. Falls back to the JSON `error` field if present.
 * 3. Falls back to the raw error message text.
 * 4. Returns `fallbackMessage` if none of the above apply.
 */
export function resolveUserFacingErrorMessage(
  error: unknown,
  fallbackMessage: string,
  codeMessages?: Record<string, string>,
): string {
  if (error instanceof Error && typeof error.message === "string" && error.message.length > 0) {
    const trimmed = error.message.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed) as { error?: unknown; code?: unknown };
        if (
          typeof parsed.code === "string" &&
          parsed.code.length > 0 &&
          codeMessages?.[parsed.code]
        ) {
          return codeMessages[parsed.code];
        }
        if (typeof parsed.error === "string" && parsed.error.length > 0) {
          return parsed.error;
        }
      } catch {
        // Ignore JSON parse failures and fall back to plain error text.
      }
    }
    return trimmed;
  }
  return fallbackMessage;
}
