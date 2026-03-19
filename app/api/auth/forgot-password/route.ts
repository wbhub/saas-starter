import { NextResponse, after } from "next/server";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { env } from "@/lib/env";
import { getResendClient, getResendFromEmail } from "@/lib/resend/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { isValidEmail } from "@/lib/validation";
import { logger } from "@/lib/logger";
const forgotPasswordPayloadSchema = z.object({
  email: z.string().trim().toLowerCase(),
});

const GENERIC_SUCCESS_MESSAGE =
  "If an account exists for that email, a reset link has been sent.";

function isProviderOutageError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const withStatus = error as { status?: number; message?: string; code?: string };
  if (typeof withStatus.status === "number" && withStatus.status >= 500) {
    return true;
  }

  const combined = `${withStatus.code ?? ""} ${withStatus.message ?? ""}`.toLowerCase();
  return (
    combined.includes("timeout") ||
    combined.includes("timed out") ||
    combined.includes("econnrefused") ||
    combined.includes("network") ||
    combined.includes("service unavailable")
  );
}

async function sendPasswordResetEmailInBackground(email: string) {
  try {
    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
      },
    });

    if (error) {
      logger.error(
        isProviderOutageError(error)
          ? "Forgot-password: recovery link failed (provider outage)"
          : "Failed to generate password reset link",
        error,
      );
      return;
    }

    if (!data.properties?.action_link) {
      logger.error("Password reset link missing from Supabase response");
      return;
    }

    try {
      const resend = getResendClient();
      const fromEmail = getResendFromEmail();

      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: "Reset your password",
        text: [
          "We received a request to reset your password.",
          "",
          "Use this link to continue:",
          data.properties.action_link,
          "",
          "If you did not request this, you can ignore this email.",
        ].join("\n"),
      });
    } catch (sendError) {
      logger.error("Failed to send password reset email", sendError);
    }
  } catch (error) {
    logger.error("Forgot-password: background job failed", error);
  }
}

export async function POST(request: Request) {
  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const bodyParse = await parseJsonWithSchema(request, forgotPasswordPayloadSchema);
  if (!bodyParse.success) {
    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  }
  const { email } = bodyParse.data;
  const clientId = getClientRateLimitIdentifier(request);
  const ipRateLimit = await checkRateLimit({
    key: `forgot-password:${clientId.keyType}:${clientId.value}`,
    ...RATE_LIMITS.forgotPasswordByClient,
  });
  if (!ipRateLimit.allowed) {
    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  }

  const emailRateLimit = await checkRateLimit({
    key: `forgot-password:email:${email}`,
    ...RATE_LIMITS.forgotPasswordByEmail,
  });
  if (!emailRateLimit.allowed) {
    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  }

  after(() => sendPasswordResetEmailInBackground(email));

  return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
}
