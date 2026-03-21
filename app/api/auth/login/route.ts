import { NextResponse } from "next/server";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { rotateCsrfTokenOnResponse, verifyCsrfProtection } from "@/lib/security/csrf";
import { isValidEmail } from "@/lib/validation";
const loginPayloadSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string(),
});

export async function POST(request: Request) {
  const t = await getRouteTranslator("ApiAuthLogin", request);

  const csrfError = verifyCsrfProtection(request, {
    invalidOrigin: t("errors.invalidOrigin"),
    missingToken: t("errors.missingCsrfToken"),
    invalidToken: t("errors.invalidCsrfToken"),
  });
  if (csrfError) {
    return csrfError;
  }

  const contentTypeError = requireJsonContentType(request, {
    errorMessage: t("errors.invalidContentType"),
  });
  if (contentTypeError) {
    return contentTypeError;
  }

  const bodyParse = await parseJsonWithSchema(request, loginPayloadSchema);
  if (!bodyParse.success) {
    if (bodyParse.tooLarge) {
      return NextResponse.json({ error: t("errors.payloadTooLarge") }, { status: 413 });
    }
    return NextResponse.json({ error: t("errors.invalidCredentials") }, { status: 400 });
  }
  const { email, password } = bodyParse.data;
  const clientId = getClientRateLimitIdentifier(request);

  const ipRateLimitPromise = checkRateLimit({
    key: `auth-login:${clientId.keyType}:${clientId.value}`,
    ...RATE_LIMITS.authLoginByClient,
  });

  const emailRateLimitPromise = isValidEmail(email)
    ? checkRateLimit({
        key: `auth-login:email:${email}`,
        ...RATE_LIMITS.authLoginByEmail,
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
      { error: t("errors.rateLimited") },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      },
    );
  }

  if (!isValidEmail(email) || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: t("errors.invalidCredentials") }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return NextResponse.json({ error: t("errors.invalidCredentials") }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  return rotateCsrfTokenOnResponse(response, request);
}
