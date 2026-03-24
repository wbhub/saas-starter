import { NextResponse } from "next/server";

export type ApiJsonSuccess<T extends Record<string, unknown> = Record<string, never>> = {
  ok: true;
} & T;

export type ApiJsonError = {
  ok: false;
  error: string;
  code?: string;
};

export function jsonSuccess<T extends Record<string, unknown>>(
  data: T = {} as T,
  init?: ResponseInit,
) {
  return NextResponse.json({ ...data, ok: true as const }, init);
}

export function jsonError(
  error: string,
  status: number,
  init?: ResponseInit & { code?: string; data?: Record<string, unknown> },
) {
  const { code, data, ...responseInit } = init ?? {};
  const body: Record<string, unknown> = { ok: false as const, error };
  if (code) {
    body.code = code;
  }
  if (data) {
    Object.assign(body, data);
  }
  return NextResponse.json(body, { ...responseInit, status });
}
