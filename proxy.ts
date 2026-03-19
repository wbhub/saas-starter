import { type NextRequest } from "next/server";
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
  const supabaseOrigin = getSupabaseOrigin();
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: https:",
    `style-src 'self' 'nonce-${nonce}'`,
    `script-src 'self' 'nonce-${nonce}' https://js.stripe.com`,
    [
      "connect-src 'self'",
      supabaseOrigin,
      "https://api.stripe.com",
      "https://js.stripe.com",
    ]
      .filter(Boolean)
      .join(" "),
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "upgrade-insecure-requests",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = generateCspNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = await updateSession(request, { requestHeaders });
  response.headers.set("Content-Security-Policy", buildCspHeader(nonce));

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
