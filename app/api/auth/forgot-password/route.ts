import { NextResponse, after } from "next/server";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { getAppUrl } from "@/lib/env";
import {
  getResendClientIfConfigured,
  getResendFromEmailIfConfigured,
  isResendCustomEmailConfigured,
} from "@/lib/resend/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { isValidEmail } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { getLocaleTranslator, resolveRequestLocale } from "@/lib/i18n/locale";
import { type AppLocale } from "@/i18n/routing";
const forgotPasswordPayloadSchema = z.object({
  email: z.string().trim().toLowerCase(),
});

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

async function sendPasswordResetEmailInBackground(email: string, locale: AppLocale) {
  try {
    const t = await getLocaleTranslator("ApiForgotPassword", locale);
    const supabaseAdmin = createAdminClient();
    const redirectTo = `${getAppUrl()}/auth/callback?next=/reset-password`;

    if (!isResendCustomEmailConfigured()) {
      logger.warn("Forgot-password: Resend is not configured, falling back to Supabase-managed email");
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        logger.error(
          isProviderOutageError(error)
            ? "Forgot-password: Supabase-managed reset email failed (provider outage)"
            : "Forgot-password: failed to send Supabase-managed reset email",
          error,
        );
      }
      return;
    }

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo,
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
      const resend = getResendClientIfConfigured();
      const fromEmail = getResendFromEmailIfConfigured();
      if (!resend || !fromEmail) {
        logger.warn(
          "Forgot-password: Resend became unavailable during send, falling back to Supabase-managed email",
        );
        const { error: fallbackError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
          redirectTo,
        });
        if (fallbackError) {
          logger.error(
            isProviderOutageError(fallbackError)
              ? "Forgot-password: Supabase-managed reset email failed after Resend fallback (provider outage)"
              : "Forgot-password: failed Supabase-managed fallback after Resend became unavailable",
            fallbackError,
          );
        }
        return;
      }

      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: t("email.subject"),
        text: [
          t("email.line1"),
          "",
          t("email.useLink"),
          data.properties.action_link,
          "",
          t("email.ignoreIfNotRequested"),
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
  const locale = resolveRequestLocale(request);
  const t = await getLocaleTranslator("ApiForgotPassword", locale);
  const genericSuccessMessage = t("messages.genericSuccess");

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
    if (bodyParse.tooLarge) {
      return NextResponse.json({ error: t("errors.payloadTooLarge") }, { status: 413 });
    }
    return NextResponse.json({ message: genericSuccessMessage });
  }
  const { email } = bodyParse.data;
  const clientId = getClientRateLimitIdentifier(request);
  const ipRateLimit = await checkRateLimit({
    key: `forgot-password:${clientId.keyType}:${clientId.value}`,
    ...RATE_LIMITS.forgotPasswordByClient,
  });
  if (!ipRateLimit.allowed) {
    return NextResponse.json({ message: genericSuccessMessage });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ message: genericSuccessMessage });
  }

  const emailRateLimit = await checkRateLimit({
    key: `forgot-password:email:${email}`,
    ...RATE_LIMITS.forgotPasswordByEmail,
  });
  if (!emailRateLimit.allowed) {
    return NextResponse.json({ message: genericSuccessMessage });
  }

  after(() => sendPasswordResetEmailInBackground(email, locale));

  return NextResponse.json({ message: genericSuccessMessage });
}
