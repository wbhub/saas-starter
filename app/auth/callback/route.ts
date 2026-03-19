import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

function getSafeNextPath(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard";
  }

  // Prevent header injection and malformed redirect values.
  if (/[\u0000-\u001F\u007F]/.test(next)) {
    return "/dashboard";
  }

  return next;
}

function toAbsoluteUrl(pathnameWithQuery: string) {
  return new URL(pathnameWithQuery, env.NEXT_PUBLIC_APP_URL).toString();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const safeNext = getSafeNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(toAbsoluteUrl("/login?error=missing_code"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(toAbsoluteUrl("/login?error=auth_callback_failed"));
  }

  return NextResponse.redirect(toAbsoluteUrl(safeNext));
}
