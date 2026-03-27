import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { env } from "@/lib/env";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { rotateCsrfTokenOnResponse, verifyCsrfProtection } from "@/lib/security/csrf";
import { validatePasswordComplexity } from "@/lib/validation";

const PASSWORD_RECOVERY_COOKIE = "auth_password_recovery";
const PASSWORD_RECOVERY_USER_COOKIE = "auth_password_recovery_user";

const resetPasswordPayloadSchema = z.object({
  password: z.string(),
});

export async function POST(request: NextRequest) {
  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const clientId = getClientRateLimitIdentifier(request);
  const rateLimit = await checkRateLimit({
    key: `reset-password-submit:${clientId.keyType}:${clientId.value}`,
    ...RATE_LIMITS.resetPasswordSubmitByClient,
  });
  if (!rateLimit.allowed) {
    return jsonError("Too many password reset attempts. Please try again later.", 429, {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const bodyParse = await parseJsonWithSchema(request, resetPasswordPayloadSchema);
  if (!bodyParse.success) {
    if (bodyParse.tooLarge) {
      return jsonError("Request payload is too large.", 413);
    }
    return jsonError("Password must be between 12 and 128 characters.", 400);
  }
  const { password } = bodyParse.data;
  const passwordValidation = validatePasswordComplexity(password);
  if (!passwordValidation.valid) {
    return jsonError(passwordValidation.error, 400);
  }

  const hasRecoveryProof = request.cookies.get(PASSWORD_RECOVERY_COOKIE)?.value === "1";
  const recoveryUserId = request.cookies.get(PASSWORD_RECOVERY_USER_COOKIE)?.value ?? "";
  if (!hasRecoveryProof || !recoveryUserId) {
    return jsonError("Reset link is invalid or expired. Please request a new link.", 403);
  }

  const successResponse = jsonSuccess();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            successResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== recoveryUserId) {
    return jsonError("Reset link is invalid or expired. Please request a new link.", 403);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    logger.error("Password update failed", error);
    return jsonError("Unable to update password. Please try again.", 400);
  }

  const response = rotateCsrfTokenOnResponse(successResponse, request);
  const secure = request.nextUrl.protocol === "https:";
  response.cookies.set({
    name: PASSWORD_RECOVERY_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/reset-password",
    maxAge: 0,
  });
  response.cookies.set({
    name: PASSWORD_RECOVERY_USER_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/reset-password",
    maxAge: 0,
  });

  return response;
}
