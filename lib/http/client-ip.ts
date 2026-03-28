import { isIP } from "net";
import { parse as parseCookieHeader } from "cookie";
import { env } from "@/lib/env";
import { CSRF_CLIENT_COOKIE_NAME, CSRF_COOKIE_NAME, ensureTokenShape } from "@/lib/security/csrf";

function extractFirstValidIp(value: string | null) {
  if (!value) return null;

  const candidates = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (isIP(candidate)) {
      return candidate;
    }
  }

  return null;
}

const DEFAULT_TRUSTED_PROXY_HEADER_KEYS = [
  "x-forwarded-for",
  "x-vercel-forwarded-for",
  "cf-connecting-ip",
  "fly-client-ip",
  "fastly-client-ip",
  "x-real-ip",
];

function getTrustedProxyHeaderKeys() {
  const configured = env.TRUSTED_PROXY_HEADER_NAMES;
  if (!configured) {
    return DEFAULT_TRUSTED_PROXY_HEADER_KEYS;
  }

  const keys = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (keys.length === 0) {
    return DEFAULT_TRUSTED_PROXY_HEADER_KEYS;
  }

  return [...new Set(keys)];
}

export function getClientIp(request: Request) {
  if (!env.TRUST_PROXY_HEADERS) {
    return null;
  }

  for (const headerKey of getTrustedProxyHeaderKeys()) {
    const trustedIp = extractFirstValidIp(request.headers.get(headerKey));
    if (trustedIp) return trustedIp;
  }

  return null;
}

function normalizeRateLimitToken(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ":")
    .replace(/^:|:$/g, "");

  return normalized.slice(0, 160) || "unknown";
}

function buildClientFingerprint(request: Request) {
  const userAgent = request.headers.get("user-agent")?.slice(0, 120) ?? "unknown";
  const acceptLanguage = request.headers.get("accept-language")?.slice(0, 120) ?? "unknown";
  const secChUa = request.headers.get("sec-ch-ua")?.slice(0, 120) ?? "unknown";
  const secChUaPlatform = request.headers.get("sec-ch-ua-platform")?.slice(0, 120) ?? "unknown";

  return normalizeRateLimitToken(`${userAgent}|${acceptLanguage}|${secChUa}|${secChUaPlatform}`);
}

function getCookieBackedClientId(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const cookies = parseCookieHeader(cookieHeader);
  const csrfCookie =
    cookies[CSRF_COOKIE_NAME]?.trim() ?? cookies[CSRF_CLIENT_COOKIE_NAME]?.trim() ?? "";

  if (!ensureTokenShape(csrfCookie)) {
    return null;
  }

  return csrfCookie;
}

export function getClientRateLimitIdentifier(request: Request) {
  const clientIp = getClientIp(request);
  if (clientIp) {
    return {
      keyType: "ip" as const,
      value: clientIp,
    };
  }

  const cookieBackedClientId = getCookieBackedClientId(request);
  if (cookieBackedClientId) {
    return {
      keyType: "cookie" as const,
      value: cookieBackedClientId,
    };
  }

  return {
    keyType: "fingerprint" as const,
    value: buildClientFingerprint(request),
  };
}
