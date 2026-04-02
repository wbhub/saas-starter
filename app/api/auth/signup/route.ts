import { getAppUrl } from "@/lib/env";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { requireJsonContentType } from "@/lib/http/content-type";
import { getOrCreateRequestId, withRequestId } from "@/lib/http/request-id";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { isPasswordAuthEnabled } from "@/lib/auth/social-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { rotateCsrfTokenOnResponse, verifyCsrfProtection } from "@/lib/security/csrf";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, validatePasswordComplexity } from "@/lib/validation";

const signupPayloadSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string(),
});

export async function POST(request: Request) {
  const t = await getRouteTranslator("ApiAuthSignup", request);
  const requestId = getOrCreateRequestId(request);

  if (!isPasswordAuthEnabled()) {
    return withRequestId(jsonError(t("errors.passwordSignupDisabled"), 403), requestId);
  }

  const csrfError = verifyCsrfProtection(request, {
    invalidOrigin: t("errors.invalidOrigin"),
    missingToken: t("errors.missingCsrfToken"),
    invalidToken: t("errors.invalidCsrfToken"),
  });
  if (csrfError) {
    return withRequestId(csrfError, requestId);
  }

  const contentTypeError = requireJsonContentType(request, {
    errorMessage: t("errors.invalidContentType"),
  });
  if (contentTypeError) {
    return withRequestId(contentTypeError, requestId);
  }

  const bodyParse = await parseJsonWithSchema(request, signupPayloadSchema);
  if (!bodyParse.success) {
    if (bodyParse.tooLarge) {
      return withRequestId(jsonError(t("errors.payloadTooLarge"), 413), requestId);
    }
    return withRequestId(jsonError(t("errors.invalidEmailOrPassword"), 400), requestId);
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
    return withRequestId(
      jsonError(t("errors.rateLimited"), 429, {
        headers: { "Retry-After": String(retryAfterSeconds) },
      }),
      requestId,
    );
  }

  const passwordValidation = validatePasswordComplexity(password);
  if (!isValidEmail(email) || !passwordValidation.valid) {
    return withRequestId(
      jsonError(
        passwordValidation.valid
          ? t("errors.invalidEmailOrPassword")
          : t("errors.passwordComplexity"),
        400,
      ),
      requestId,
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
    return withRequestId(jsonError(t("errors.unableToCreateAccount"), 400), requestId);
  }

  const response = withRequestId(
    jsonSuccess({
      sessionCreated: Boolean(data.session),
      message: data.session ? undefined : t("messages.accountCreated"),
    }),
    requestId,
  );
  return rotateCsrfTokenOnResponse(response, request);
}
