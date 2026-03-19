import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/http/client-ip";
import { requireJsonContentType } from "@/lib/http/content-type";
import { checkRateLimit } from "@/lib/security/rate-limit";

type LoginPayload = {
  email?: string;
  password?: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const body = (await request.json().catch(() => null)) as LoginPayload | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  const clientIp = getClientIp(request);

  const ipRateLimitPromise = clientIp
    ? checkRateLimit({
        key: `auth-login:ip:${clientIp}`,
        limit: 20,
        windowMs: 10 * 60 * 1000,
      })
    : Promise.resolve({ allowed: true, retryAfterSeconds: 0 });

  const emailRateLimitPromise = isValidEmail(email)
    ? checkRateLimit({
        key: `auth-login:email:${email}`,
        limit: 10,
        windowMs: 10 * 60 * 1000,
      })
    : Promise.resolve({ allowed: true, retryAfterSeconds: 0 });

  const [ipRateLimit, emailRateLimit] = await Promise.all([
    ipRateLimitPromise,
    emailRateLimitPromise,
  ]);

  if (!ipRateLimit.allowed || !emailRateLimit.allowed) {
    const retryAfterSeconds = Math.max(
      ipRateLimit.retryAfterSeconds,
      emailRateLimit.retryAfterSeconds,
    );
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      },
    );
  }

  if (!isValidEmail(email) || password.length < 8) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
