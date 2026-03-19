import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getClientIp } from "@/lib/http/client-ip";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";

function getSafeNextPath(next: string | null) {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("://")
  ) {
    return "/dashboard";
  }

  // Prevent header injection and malformed redirect values.
  if (/[\u0000-\u001F\u007F]/.test(next)) {
    return "/dashboard";
  }

  return next;
}

function getCallbackRateLimitKey(request: Request) {
  const clientIp = getClientIp(request);
  if (clientIp) {
    return `auth-callback:ip:${clientIp}`;
  }

  // Avoid cross-user throttling when requests are indistinguishable behind proxies.
  return null;
}

function toAbsoluteUrl(pathnameWithQuery: string) {
  return new URL(pathnameWithQuery, env.NEXT_PUBLIC_APP_URL).toString();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const safeNext = getSafeNextPath(searchParams.get("next"));

  const rateLimitKey = getCallbackRateLimitKey(request);
  if (rateLimitKey) {
    const rateLimit = await checkRateLimit({
      key: rateLimitKey,
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many callback attempts. Please wait and try again." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }
  }

  if (!code) {
    return NextResponse.redirect(toAbsoluteUrl("/login?error=missing_code"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(toAbsoluteUrl("/login?error=invalid_code"));
  }

  return NextResponse.redirect(toAbsoluteUrl(safeNext));
}
