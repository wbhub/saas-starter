import { NextResponse } from "next/server";

const JSON_MEDIA_TYPE = "application/json";

function getMediaType(value: string | null) {
  if (!value) return null;
  return value.split(";")[0]?.trim().toLowerCase() ?? null;
}

export function hasJsonContentType(request: Request) {
  return getMediaType(request.headers.get("content-type")) === JSON_MEDIA_TYPE;
}

export function requireJsonContentType(
  request: Request,
  options?: { errorMessage?: string },
) {
  if (hasJsonContentType(request)) {
    return null;
  }

  return NextResponse.json(
    { ok: false as const, error: options?.errorMessage ?? "Content-Type must be application/json." },
    { status: 415 },
  );
}
