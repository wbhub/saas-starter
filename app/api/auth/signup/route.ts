import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/http/client-ip";
import { checkRateLimit } from "@/lib/security/rate-limit";

type SignupPayload = {
  email?: string;
  password?: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SignupPayload | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  const clientIp = getClientIp(request);

  const ipRateLimitPromise = clientIp
    ? checkRateLimit({
        key: `auth-signup:ip:${clientIp}`,
        limit: 10,
        windowMs: 10 * 60 * 1000,
      })
    : Promise.resolve({ allowed: true, retryAfterSeconds: 0 });

  const emailRateLimitPromise = isValidEmail(email)
    ? checkRateLimit({
        key: `auth-signup:email:${email}`,
        limit: 3,
        windowMs: 60 * 60 * 1000,
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
      { error: "Too many signup attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      },
    );
  }

  if (!isValidEmail(email) || password.length < 8) {
    return NextResponse.json(
      { error: "Please provide a valid email and password." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    return NextResponse.json({ error: "Unable to create your account." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    sessionCreated: Boolean(data.session),
    message: data.session
      ? undefined
      : "Account created. Check your inbox to verify email if confirmation is enabled.",
  });
}
