import { NextResponse } from "next/server";
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

function getCallbackRateLimitKey(request: Request) {
  const clientIp = getClientIp(request);
  if (clientIp) {
    return `auth-callback:ip:${clientIp}`;
  }

  // Fallback keeps anonymous traffic scoped better than a single shared "unknown" bucket.
  const userAgent = request.headers.get("user-agent")?.slice(0, 120) ?? "unknown";
  return `auth-callback:ua:${userAgent}`;
}

function toAbsoluteUrl(pathnameWithQuery: string) {
  return new URL(pathnameWithQuery, env.NEXT_PUBLIC_APP_URL).toString();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const safeNext = getSafeNextPath(searchParams.get("next"));

  const rateLimit = await checkRateLimit({
    key: getCallbackRateLimitKey(request),
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
