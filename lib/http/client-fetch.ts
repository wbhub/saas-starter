import { getCsrfHeaders } from "@/lib/http/csrf";

/**
 * Response payload type for typical API JSON responses.
 * Extend via generics for endpoint-specific fields.
 */
export type ApiJsonPayload<T extends Record<string, unknown> = Record<string, unknown>> = {
  ok?: boolean;
  error?: string;
} & T;

export type ClientFetchOptions = RequestInit & {
  /** Convenience: serialised as JSON body with Content-Type header. */
  json?: Record<string, unknown>;
  /** Fallback error message when response has no `error` field. */
  fallbackErrorMessage?: string;
};

/**
 * Authenticated client-side fetch with CSRF headers.
 *
 * - Automatically attaches CSRF token headers.
 * - If `json` is provided, sets Content-Type and stringifies the body.
 * - Throws on non-ok responses, extracting `error` from the JSON body when possible.
 */
export async function clientFetch(
  path: string,
  options: ClientFetchOptions = {},
): Promise<Response> {
  const { json, fallbackErrorMessage, headers: extraHeaders, body, ...rest } = options;

  const headers: Record<string, string> = {
    ...getCsrfHeaders(),
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(extraHeaders as Record<string, string> | undefined),
  };

  const response = await fetch(path, {
    ...rest,
    headers,
    body: json ? JSON.stringify(json) : body,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? fallbackErrorMessage ?? "Request failed");
  }

  return response;
}

/**
 * Convenience wrapper: POST JSON and parse the response.
 */
export async function clientPostJson<T extends Record<string, unknown> = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
  options: Omit<ClientFetchOptions, "json" | "method"> = {},
): Promise<ApiJsonPayload<T>> {
  const response = await clientFetch(path, {
    ...options,
    method: "POST",
    json: body,
  });
  return (await response.json()) as ApiJsonPayload<T>;
}

/**
 * Convenience wrapper: PATCH JSON and parse the response.
 */
export async function clientPatchJson<T extends Record<string, unknown> = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
  options: Omit<ClientFetchOptions, "json" | "method"> = {},
): Promise<ApiJsonPayload<T>> {
  const response = await clientFetch(path, {
    ...options,
    method: "PATCH",
    json: body,
  });
  return (await response.json()) as ApiJsonPayload<T>;
}
