import { NextResponse, type NextRequest } from "next/server";
import {
  CSRF_CLIENT_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  createCsrfToken,
  getClientReadableCsrfCookieOptions,
  getCsrfCookieOptions,
} from "@/lib/security/csrf";
import { createRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { updateSession } from "@/lib/supabase/middleware";
import { isFreePlanEnabled } from "@/lib/billing/provider";
import { ONBOARDING_COMPLETE_COOKIE } from "@/lib/constants/onboarding";

function getSupabaseOrigin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return "";

  try {
    return new URL(supabaseUrl).origin;
  } catch {
    return "";
  }
}

function generateCspNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function buildCspHeader(nonce: string) {
  // Keep development ergonomics intact (Next dev overlays/HMR/devtools rely on
  // inline/eval/websocket behavior that strict production CSP blocks).
  if (process.env.NODE_ENV !== "production") {
    return [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob: https: http:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:",
      "connect-src 'self' ws: wss: https: http:",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    ].join("; ");
  }

  const supabaseOrigin = getSupabaseOrigin();
  const intercomEnabled = Boolean(process.env.NEXT_PUBLIC_INTERCOM_APP_ID);

  const directives: (string | undefined)[] = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: https:",

    // Intercom injects inline styles without nonce support, so 'unsafe-inline'
    // is required when the widget is enabled. Keeping the nonce alongside it
    // ensures our own <style nonce="…"> elements remain explicitly allowed in
    // browsers that honour both directives.
    intercomEnabled
      ? `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`
      : `style-src 'self' 'nonce-${nonce}'`,

    [
      `script-src 'self' 'nonce-${nonce}' https://js.stripe.com`,
      intercomEnabled && "https://widget.intercom.io https://js.intercomcdn.com",
    ]
      .filter(Boolean)
      .join(" "),

    [
      "connect-src 'self'",
      supabaseOrigin,
      "https://api.stripe.com",
      "https://js.stripe.com",
      intercomEnabled &&
        "https://api-iam.intercom.io https://api-iam.eu.intercom.io https://api-ping.intercom.io wss://nexus-websocket-a.intercom.io wss://nexus-websocket-b.intercom.io",
    ]
      .filter(Boolean)
      .join(" "),

    [
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
      intercomEnabled && "https://intercom-sheets.com",
    ]
      .filter(Boolean)
      .join(" "),

    intercomEnabled ? "font-src 'self' https://js.intercomcdn.com" : undefined,
    intercomEnabled ? "media-src 'self' https://js.intercomcdn.com" : undefined,

    "upgrade-insecure-requests",
  ];

  return directives.filter(Boolean).join("; ");
}

function isProtectedDashboardPath(pathname: string) {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

function shouldRefreshSession(pathname: string) {
  return (
    isProtectedDashboardPath(pathname) ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/onboarding" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/reset-password/") ||
    pathname === "/auth/callback" ||
    pathname === "/auth/confirm" ||
    pathname === "/invite" ||
    pathname.startsWith("/invite/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  );
}

function getSafeNextPath(pathname: string, search: string) {
  const next = `${pathname}${search}`;
  if (!next.startsWith("/")) {
    return "/dashboard";
  }
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
  return next;
}

export async function proxy(request: NextRequest) {
  const nonce = generateCspNonce();
  const requestId = createRequestId();
  const hasCsrfCookie = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  let user = null;

  let supabase = null;
  // Refresh session on known auth-sensitive paths. When free plan is disabled,
  // also refresh on public pages if auth cookies are present (to detect limbo users).
  const freePlanEnabled = isFreePlanEnabled();
  const hasAuthCookies = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (shouldRefreshSession(request.nextUrl.pathname) || (!freePlanEnabled && hasAuthCookies)) {
    const sessionResult = await updateSession(request, { requestHeaders });
    response = sessionResult.response;
    user = sessionResult.user;
    supabase = sessionResult.supabase;
  }

  // Auto sign-out limbo users: authenticated but haven't completed onboarding,
  // navigating to a public page when there's no free plan to fall back on.
  if (user && supabase && !freePlanEnabled) {
    const pathname = request.nextUrl.pathname;
    const isPublicPage =
      !pathname.startsWith("/onboarding") &&
      !pathname.startsWith("/api/") &&
      !pathname.startsWith("/dashboard") &&
      !pathname.startsWith("/auth/") &&
      !pathname.startsWith("/signup");

    if (isPublicPage) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.onboarding_completed_at) {
        await supabase.auth.signOut();
        const redirectUrl = request.nextUrl.clone();
        const signOutResponse = NextResponse.redirect(redirectUrl);
        for (const cookie of request.cookies.getAll()) {
          if (cookie.name.startsWith("sb-")) {
            signOutResponse.cookies.delete(cookie.name);
          }
        }
        signOutResponse.cookies.delete(ONBOARDING_COMPLETE_COOKIE);
        signOutResponse.headers.set("Content-Security-Policy", buildCspHeader(nonce));
        signOutResponse.headers.set(REQUEST_ID_HEADER, requestId);
        return signOutResponse;
      }
    }
  }

  if (!user && isProtectedDashboardPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      getSafeNextPath(request.nextUrl.pathname, request.nextUrl.search),
    );
    const redirectResponse = NextResponse.redirect(loginUrl);
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    if (!hasCsrfCookie) {
      const token = createCsrfToken();
      redirectResponse.cookies.set({
        name: CSRF_COOKIE_NAME,
        value: token,
        ...getCsrfCookieOptions(request.nextUrl.protocol === "https:"),
      });
      redirectResponse.cookies.set({
        name: CSRF_CLIENT_COOKIE_NAME,
        value: token,
        ...getClientReadableCsrfCookieOptions(request.nextUrl.protocol === "https:"),
      });
    }
    redirectResponse.headers.set("Content-Security-Policy", buildCspHeader(nonce));
    redirectResponse.headers.set(REQUEST_ID_HEADER, requestId);
    return redirectResponse;
  }

  response.headers.set("Content-Security-Policy", buildCspHeader(nonce));
  response.headers.set(REQUEST_ID_HEADER, requestId);
  if (!hasCsrfCookie) {
    const token = createCsrfToken();
    response.cookies.set({
      name: CSRF_COOKIE_NAME,
      value: token,
      ...getCsrfCookieOptions(request.nextUrl.protocol === "https:"),
    });
    response.cookies.set({
      name: CSRF_CLIENT_COOKIE_NAME,
      value: token,
      ...getClientReadableCsrfCookieOptions(request.nextUrl.protocol === "https:"),
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
