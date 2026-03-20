import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { getAppUrl } from "@/lib/env";

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,200}$/;

function parseCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return "";
  }
  const parsed = parseCookieHeader(cookieHeader);
  return parsed[name] ?? "";
}

function toOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function getAllowedOrigins(request: Request) {
  const origins = new Set<string>();
  origins.add(toOrigin(request.url));
  origins.add(toOrigin(getAppUrl()));
  origins.delete("");
  return origins;
}

function isBrowserRequestFromAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }

  return getAllowedOrigins(request).has(origin);
}

export function createCsrfToken() {
  return randomBytes(24).toString("base64url");
}

export function ensureTokenShape(token: string) {
  return TOKEN_RE.test(token);
}

export function verifyCsrfProtection(request: Request) {
  if (process.env.NODE_ENV === "test") {
    return null;
  }

  if (!isBrowserRequestFromAllowedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const headerToken = request.headers.get(CSRF_HEADER_NAME)?.trim() ?? "";
  const cookieToken = parseCookieValue(
    request.headers.get("cookie"),
    CSRF_COOKIE_NAME,
  ).trim();

  if (!ensureTokenShape(headerToken) || !ensureTokenShape(cookieToken)) {
    return NextResponse.json({ error: "Missing CSRF token." }, { status: 403 });
  }

  if (headerToken !== cookieToken) {
    return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
  }

  return null;
}
