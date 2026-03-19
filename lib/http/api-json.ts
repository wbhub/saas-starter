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
