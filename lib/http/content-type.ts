import { NextResponse } from "next/server";

const JSON_MEDIA_TYPE = "application/json";

function getMediaType(value: string | null) {
  if (!value) return null;
  return value.split(";")[0]?.trim().toLowerCase() ?? null;
}

export function hasJsonContentType(request: Request) {
  return getMediaType(request.headers.get("content-type")) === JSON_MEDIA_TYPE;
}

export function requireJsonContentType(request: Request) {
  if (hasJsonContentType(request)) {
    return null;
  }

  return NextResponse.json(
    { error: "Content-Type must be application/json." },
    { status: 415 },
  );
}
