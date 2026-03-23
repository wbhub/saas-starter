import { NextResponse } from "next/server";

export type ApiJsonSuccess<T extends Record<string, unknown> = Record<string, never>> = {
  ok: true;
} & T;

export type ApiJsonError = {
  ok: false;
  error: string;
};

export function jsonSuccess<T extends Record<string, unknown>>(
  data: T = {} as T,
  init?: ResponseInit,
) {
  return NextResponse.json({ ok: true as const, ...data }, init);
}

export function jsonError(error: string, status: number, init?: ResponseInit) {
  return NextResponse.json({ ok: false as const, error }, { ...init, status });
}

export async function jsonErrorFromResponse(response: Response, fallbackError: string) {
  try {
    const payload = (await response.clone().json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim().length > 0) {
      return jsonError(payload.error, response.status, { headers: response.headers });
    }
  } catch {
    // Ignore parse failures and fallback to provided default message.
  }

  return jsonError(fallbackError, response.status, { headers: response.headers });
}
