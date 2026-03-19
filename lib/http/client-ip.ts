import { createHash } from "crypto";
import { isIP } from "net";

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

function createFallbackFingerprint(request: Request) {
  const userAgent = request.headers.get("user-agent") ?? "";
  const acceptLanguage = request.headers.get("accept-language") ?? "";
  const forwardedHost = request.headers.get("x-forwarded-host") ?? "";
  return createHash("sha256")
    .update(`${userAgent}|${acceptLanguage}|${forwardedHost}`)
    .digest("hex")
    .slice(0, 16);
}

export function getClientIp(request: Request) {
  const trustProxyHeaders = process.env.TRUST_PROXY_HEADERS === "true";
  if (!trustProxyHeaders) {
    return `unknown:${createFallbackFingerprint(request)}`;
  }

  const trustedHeaderKeys = [
    "x-vercel-forwarded-for",
    "cf-connecting-ip",
    "fly-client-ip",
    "fastly-client-ip",
  ];

  for (const headerKey of trustedHeaderKeys) {
    const trustedIp = extractFirstValidIp(request.headers.get(headerKey));
    if (trustedIp) return trustedIp;
  }

  return `unknown:${createFallbackFingerprint(request)}`;
}

