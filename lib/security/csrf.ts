import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { getAppUrl } from "@/lib/env";

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";
export const CSRF_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

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

function addLocalDevAliasOrigins(origins: Set<string>, origin: string) {
  if (process.env.NODE_ENV === "production" || !origin) {
    return;
  }
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return;
    }
    // Preserve explicit ports; omit port segment when URL uses the default for the scheme
    // (e.g. http://localhost:3000 ↔ http://127.0.0.1:3000, not a bogus :80 for dev).
    const portPart = parsed.port ? `:${parsed.port}` : "";
    if (parsed.hostname === "localhost") {
      origins.add(`${parsed.protocol}//127.0.0.1${portPart}`);
    }
    if (parsed.hostname === "127.0.0.1") {
      origins.add(`${parsed.protocol}//localhost${portPart}`);
    }
  } catch {
    // ignore
  }
}

function getAllowedOrigins(request: Request) {
  const origins = new Set<string>();
  const requestOrigin = toOrigin(request.url);
  const appOrigin = toOrigin(getAppUrl());
  origins.add(requestOrigin);
  origins.add(appOrigin);
  addLocalDevAliasOrigins(origins, requestOrigin);
  addLocalDevAliasOrigins(origins, appOrigin);
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

function isHttpsUrl(url: string) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

export function getCsrfCookieOptions(secure: boolean) {
  return {
    sameSite: "strict" as const,
    secure,
    path: "/",
    maxAge: CSRF_COOKIE_MAX_AGE_SECONDS,
  };
}

export function rotateCsrfTokenOnResponse(response: NextResponse, request: Request) {
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: createCsrfToken(),
    ...getCsrfCookieOptions(isHttpsUrl(request.url)),
  });
  return response;
}

export function getServerActionCsrfCookieOptions() {
  return getCsrfCookieOptions(process.env.NODE_ENV === "production");
}

type CsrfErrorMessages = {
  invalidOrigin?: string;
  missingToken?: string;
  invalidToken?: string;
};

export function verifyCsrfProtection(request: Request, messages?: CsrfErrorMessages) {
  if (!isBrowserRequestFromAllowedOrigin(request)) {
    return NextResponse.json(
      { error: messages?.invalidOrigin ?? "Invalid request origin." },
      { status: 403 },
    );
  }

  const headerToken = request.headers.get(CSRF_HEADER_NAME)?.trim() ?? "";
  const cookieToken = parseCookieValue(
    request.headers.get("cookie"),
    CSRF_COOKIE_NAME,
  ).trim();

  if (!ensureTokenShape(headerToken) || !ensureTokenShape(cookieToken)) {
    return NextResponse.json(
      { error: messages?.missingToken ?? "Missing CSRF token." },
      { status: 403 },
    );
  }

  if (headerToken !== cookieToken) {
    return NextResponse.json(
      { error: messages?.invalidToken ?? "Invalid CSRF token." },
      { status: 403 },
    );
  }

  return null;
}

type ServerActionCsrfError = {
  status: "error";
  message: string;
};

function getAllowedOriginsFromHeaders(requestHeaders: Headers) {
  const origins = new Set<string>();
  origins.add(toOrigin(getAppUrl()));

  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (forwardedHost) {
    const forwardedProto = requestHeaders.get("x-forwarded-proto");
    const protocol = forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : process.env.NODE_ENV === "production"
        ? "https"
        : "http";
    origins.add(`${protocol}://${forwardedHost}`);
  }

  origins.delete("");
  return origins;
}

function isServerActionRequestFromAllowedOrigin(requestHeaders: Headers) {
  const origin = requestHeaders.get("origin");
  if (!origin) {
    return false;
  }

  return getAllowedOriginsFromHeaders(requestHeaders).has(origin);
}

export function verifyCsrfProtectionForServerAction(
  requestHeaders: Headers,
  formData?: FormData,
  messages?: CsrfErrorMessages,
): ServerActionCsrfError | null {
  if (!isServerActionRequestFromAllowedOrigin(requestHeaders)) {
    return {
      status: "error",
      message: messages?.invalidOrigin ?? "Invalid request origin.",
    };
  }

  const formTokenInput = formData?.get(CSRF_COOKIE_NAME);
  const formToken = typeof formTokenInput === "string" ? formTokenInput.trim() : "";
  const headerToken = requestHeaders.get(CSRF_HEADER_NAME)?.trim() ?? "";
  const submittedToken = headerToken || formToken;
  const cookieToken = parseCookieValue(
    requestHeaders.get("cookie"),
    CSRF_COOKIE_NAME,
  ).trim();

  if (!ensureTokenShape(submittedToken) || !ensureTokenShape(cookieToken)) {
    return {
      status: "error",
      message: messages?.missingToken ?? "Missing CSRF token.",
    };
  }

  if (submittedToken !== cookieToken) {
    return {
      status: "error",
      message: messages?.invalidToken ?? "Invalid CSRF token.",
    };
  }

  return null;
}
