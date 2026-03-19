import { NextRequest, NextResponse } from "next/server";
import { DAY_MS, MINUTE_MS } from "@/lib/constants/durations";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { env } from "@/lib/env";
import { getClientIp } from "@/lib/http/client-ip";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";

function getSafeNextPath(next: string | null) {
  if (!next) {
    return "/dashboard";
  }

  // Prevent header injection and malformed redirect values.
  if (/[\u0000-\u001F\u007F]/.test(next) || next.includes("\\")) {
    return "/dashboard";
  }

  try {
    const parsed = new URL(next, "http://localhost");
    if (parsed.origin !== "http://localhost" || !parsed.pathname.startsWith("/")) {
      return "/dashboard";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}

const CALLBACK_RATE_LIMIT_COOKIE = "auth_callback_client";
const CALLBACK_RATE_LIMIT_COOKIE_MAX_AGE_SECONDS = (30 * DAY_MS) / 1000;
const PASSWORD_RECOVERY_COOKIE = "auth_password_recovery";
const PASSWORD_RECOVERY_USER_COOKIE = "auth_password_recovery_user";
const PASSWORD_RECOVERY_COOKIE_MAX_AGE_SECONDS = (10 * MINUTE_MS) / 1000;

function getCallbackClientId(request: NextRequest) {
  const existing = request.cookies.get(CALLBACK_RATE_LIMIT_COOKIE)?.value;
  if (existing && /^[a-zA-Z0-9_-]{10,}$/.test(existing)) {
    return { value: existing, isNew: false };
  }

  return {
    value: crypto.randomUUID(),
    isNew: true,
  };
}

function getCallbackRateLimitKey(request: NextRequest, callbackClientId: string) {
  const clientIp = getClientIp(request);
  if (clientIp) {
    return `auth-callback:ip:${clientIp}`;
  }

  return `auth-callback:client:${callbackClientId}`;
}

function toAbsoluteUrl(pathnameWithQuery: string) {
  return new URL(pathnameWithQuery, env.NEXT_PUBLIC_APP_URL).toString();
}

function maybeSetCallbackCookie(response: NextResponse, request: NextRequest, isNew: boolean, value: string) {
  if (!isNew) return response;

  response.cookies.set({
    name: CALLBACK_RATE_LIMIT_COOKIE,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: CALLBACK_RATE_LIMIT_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

function maybeSetPasswordRecoveryCookies(
  response: NextResponse,
  request: NextRequest,
  safeNextPath: string,
  recoveryUserId: string,
) {
  if (!safeNextPath.startsWith("/reset-password")) {
    return response;
  }

  response.cookies.set({
    name: PASSWORD_RECOVERY_COOKIE,
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/reset-password",
    maxAge: PASSWORD_RECOVERY_COOKIE_MAX_AGE_SECONDS,
  });
  response.cookies.set({
    name: PASSWORD_RECOVERY_USER_COOKIE,
    value: recoveryUserId,
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/reset-password",
    maxAge: PASSWORD_RECOVERY_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const safeNext = getSafeNextPath(searchParams.get("next"));
  const callbackClientId = getCallbackClientId(request);

  const rateLimit = await checkRateLimit({
    key: getCallbackRateLimitKey(request, callbackClientId.value),
    ...RATE_LIMITS.authCallbackByClient,
  });
  if (!rateLimit.allowed) {
    const response = NextResponse.json(
      { error: "Too many callback attempts. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
    return maybeSetCallbackCookie(response, request, callbackClientId.isNew, callbackClientId.value);
  }

  if (!code) {
    const response = NextResponse.redirect(toAbsoluteUrl("/login?error=missing_code"));
    return maybeSetCallbackCookie(response, request, callbackClientId.isNew, callbackClientId.value);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const response = NextResponse.redirect(toAbsoluteUrl("/login?error=invalid_code"));
    return maybeSetCallbackCookie(response, request, callbackClientId.isNew, callbackClientId.value);
  }

  const recoveredUserId = data.session?.user.id;
  if (safeNext.startsWith("/reset-password") && !recoveredUserId) {
    const response = NextResponse.redirect(toAbsoluteUrl("/login?error=invalid_code"));
    return maybeSetCallbackCookie(response, request, callbackClientId.isNew, callbackClientId.value);
  }

  const response = NextResponse.redirect(toAbsoluteUrl(safeNext));
  if (recoveredUserId) {
    maybeSetPasswordRecoveryCookies(response, request, safeNext, recoveredUserId);
  }
  return maybeSetCallbackCookie(response, request, callbackClientId.isNew, callbackClientId.value);
}
