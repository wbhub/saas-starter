import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { isValidEmail, validatePasswordComplexity } from "@/lib/validation";
const signupPayloadSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string(),
});

export async function POST(request: Request) {
  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const bodyParse = await parseJsonWithSchema(request, signupPayloadSchema);
  if (!bodyParse.success) {
    if (bodyParse.tooLarge) {
      return NextResponse.json({ error: "Request payload is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Please provide a valid email and password." }, { status: 400 });
  }
  const { email, password } = bodyParse.data;
  const clientId = getClientRateLimitIdentifier(request);

  const ipRateLimitPromise = checkRateLimit({
    key: `auth-signup:${clientId.keyType}:${clientId.value}`,
    ...RATE_LIMITS.authSignupByClient,
  });

  const emailRateLimitPromise = isValidEmail(email)
    ? checkRateLimit({
        key: `auth-signup:email:${email}`,
        ...RATE_LIMITS.authSignupByEmail,
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

  const passwordValidation = validatePasswordComplexity(password);
  if (!isValidEmail(email) || !passwordValidation.valid) {
    return NextResponse.json(
      { error: passwordValidation.valid ? "Please provide a valid email and password." : passwordValidation.error },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=/dashboard`,
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
