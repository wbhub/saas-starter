import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { LAST_AUTH_PROVIDER_COOKIE, parseSupabaseProvider } from "@/lib/auth/social-auth";
import { DAY_MS, MINUTE_MS } from "@/lib/constants/durations";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { env, getAppUrl } from "@/lib/env";
import { getClientIp } from "@/lib/http/client-ip";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { rotateCsrfTokenOnResponse } from "@/lib/security/csrf";

function getSafeNextPath(next: string | null) {
  if (!next) {
    return "/dashboard";
  }

  // Prevent header injection and malformed redirect values.
  if (/[\u0000-\u001F\u007F]/.test(next) || next.includes("\\") || next.startsWith("//")) {
    return "/dashboard";
  }
  try {
    const decoded = decodeURIComponent(next);
    if (decoded.includes("\\") || decoded.startsWith("//") || decoded.startsWith("/\\")) {
      return "/dashboard";
    }
  } catch {
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
const LAST_AUTH_PROVIDER_MAX_AGE_SECONDS = (180 * DAY_MS) / 1000;

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
  const baseUrl = getAppUrl();
  try {
    return new URL(pathnameWithQuery, baseUrl).toString();
  } catch {
    return new URL(pathnameWithQuery, "http://localhost:3000").toString();
  }
}

function maybeSetCallbackCookie(
  response: NextResponse,
  request: NextRequest,
  isNew: boolean,
  value: string,
) {
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

function maybeSetLastAuthProviderCookie(
  response: NextResponse,
  request: NextRequest,
  sessionProvider?: string | null,
) {
  const parsedProvider = parseSupabaseProvider(sessionProvider);
  if (!parsedProvider) {
    return response;
  }

  response.cookies.set({
    name: LAST_AUTH_PROVIDER_COOKIE,
    value: parsedProvider,
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: LAST_AUTH_PROVIDER_MAX_AGE_SECONDS,
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
    return maybeSetCallbackCookie(
      response,
      request,
      callbackClientId.isNew,
      callbackClientId.value,
    );
  }

  if (!code) {
    const response = NextResponse.redirect(toAbsoluteUrl("/login?error=missing_code"));
    return maybeSetCallbackCookie(
      response,
      request,
      callbackClientId.isNew,
      callbackClientId.value,
    );
  }

  // Build the success redirect response first so the Supabase client can set
  // auth cookies directly on it.  Using the cookies() store (via createClient
  // from lib/supabase/server) risks the auth cookies being dropped when a
  // NextResponse.redirect() is returned — the same issue the proxy/middleware
  // avoids by writing cookies onto the NextResponse object itself.
  const response = NextResponse.redirect(toAbsoluteUrl(safeNext));

  // @supabase/ssr hardcodes flowType: "pkce" and exchangeCodeForSession throws
  // AuthPKCECodeVerifierMissingError when no code_verifier cookie exists.  For
  // email-based flows (password recovery, signup confirmation) the reset email
  // is generated server-side so no browser PKCE flow stores a code_verifier.
  // Inject a placeholder so the client-side check passes — the Supabase server
  // accepts it because email-generated codes have no code_challenge to validate.
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const codeVerifierCookieName = `sb-${ref}-auth-token-code-verifier`;
  const hasCodeVerifier = request.cookies.getAll().some((c) => c.name === codeVerifierCookieName);
  if (!hasCodeVerifier) {
    request.cookies.set(codeVerifierCookieName, "server-side-email-flow");
  }

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const errorResponse = NextResponse.redirect(toAbsoluteUrl("/login?error=invalid_code"));
    return maybeSetCallbackCookie(
      errorResponse,
      request,
      callbackClientId.isNew,
      callbackClientId.value,
    );
  }

  const recoveredUserId = data.session?.user.id;
  if (safeNext.startsWith("/reset-password") && !recoveredUserId) {
    const errorResponse = NextResponse.redirect(toAbsoluteUrl("/login?error=invalid_code"));
    return maybeSetCallbackCookie(
      errorResponse,
      request,
      callbackClientId.isNew,
      callbackClientId.value,
    );
  }

  rotateCsrfTokenOnResponse(response, request);
  if (recoveredUserId) {
    maybeSetPasswordRecoveryCookies(response, request, safeNext, recoveredUserId);
  }
  maybeSetLastAuthProviderCookie(response, request, data.session?.user.app_metadata?.provider);
  return maybeSetCallbackCookie(response, request, callbackClientId.isNew, callbackClientId.value);
}
