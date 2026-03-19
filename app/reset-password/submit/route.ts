import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { requireJsonContentType } from "@/lib/http/content-type";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

const PASSWORD_RECOVERY_COOKIE = "auth_password_recovery";
const PASSWORD_RECOVERY_USER_COOKIE = "auth_password_recovery_user";

type ResetPasswordPayload = {
  password?: string;
};

export async function POST(request: NextRequest) {
  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const clientId = getClientRateLimitIdentifier(request);
  const rateLimit = await checkRateLimit({
    key: `reset-password-submit:${clientId.keyType}:${clientId.value}`,
    limit: 15,
    windowMs: 10 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return jsonError("Too many password reset attempts. Please try again later.", 429, {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const body = (await request.json().catch(() => null)) as ResetPasswordPayload | null;
  const password = body?.password ?? "";
  if (password.length < 8) {
    return jsonError("Password must be at least 8 characters.", 400);
  }

  const hasRecoveryProof = request.cookies.get(PASSWORD_RECOVERY_COOKIE)?.value === "1";
  const recoveryUserId = request.cookies.get(PASSWORD_RECOVERY_USER_COOKIE)?.value ?? "";
  if (!hasRecoveryProof || !recoveryUserId) {
    return jsonError(
      "Reset link is invalid or expired. Please request a new link.",
      403,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== recoveryUserId) {
    return jsonError(
      "Reset link is invalid or expired. Please request a new link.",
      403,
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return jsonError(error.message, 400);
  }

  const response = jsonSuccess();
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
