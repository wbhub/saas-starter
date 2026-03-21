import { NextResponse, type NextRequest } from "next/server";
import {
  CSRF_COOKIE_NAME,
  createCsrfToken,
  getCsrfCookieOptions,
} from "@/lib/security/csrf";
import { createRequestId, REQUEST_ID_HEADER } from "@/lib/http/request-id";
import { updateSession } from "@/lib/supabase/middleware";

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

    intercomEnabled
      ? "font-src 'self' https://js.intercomcdn.com"
      : undefined,
    intercomEnabled
      ? "media-src 'self' https://js.intercomcdn.com"
      : undefined,

    "upgrade-insecure-requests",
  ];

  return directives.filter(Boolean).join("; ");
}

function isProtectedDashboardPath(pathname: string) {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

function getSafeNextPath(pathname: string, search: string) {
  const next = `${pathname}${search}`;
  if (!next.startsWith("/")) {
    return "/dashboard";
  }
  if (/[\u0000-\u001F\u007F]/.test(next) || next.includes("\\")) {
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

  const { response, user } = await updateSession(request, { requestHeaders });
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
      redirectResponse.cookies.set({
        name: CSRF_COOKIE_NAME,
        value: createCsrfToken(),
        ...getCsrfCookieOptions(request.nextUrl.protocol === "https:"),
      });
    }
    redirectResponse.headers.set("Content-Security-Policy", buildCspHeader(nonce));
    redirectResponse.headers.set(REQUEST_ID_HEADER, requestId);
    return redirectResponse;
  }

  response.headers.set("Content-Security-Policy", buildCspHeader(nonce));
  response.headers.set(REQUEST_ID_HEADER, requestId);
  if (!hasCsrfCookie) {
    response.cookies.set({
      name: CSRF_COOKIE_NAME,
      value: createCsrfToken(),
      ...getCsrfCookieOptions(request.nextUrl.protocol === "https:"),
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
