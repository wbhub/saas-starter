import { after } from "next/server";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { getAppUrl, isDevelopmentEnvironment } from "@/lib/env";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { requireJsonContentType } from "@/lib/http/content-type";
import { getOrCreateRequestId, withRequestId } from "@/lib/http/request-id";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { isValidEmail } from "@/lib/validation";
import { getSafeNextPath } from "@/lib/auth/safe-next";
import { getLoginMethod } from "@/lib/auth/social-auth";
import { logger } from "@/lib/logger";
import { resolveRequestLocale, getLocaleTranslator } from "@/lib/i18n/locale";
import { type AppLocale } from "@/i18n/routing";
import {
  getResendClientIfConfigured,
  getResendFromEmailIfConfigured,
  isResendCustomEmailConfigured,
  sendResendEmail,
} from "@/lib/resend/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isTriggerConfigured } from "@/lib/trigger/config";
import { triggerSendEmailTask } from "@/lib/trigger/dispatch";

const magicLinkPayloadSchema = z.object({
  email: z.string().trim().toLowerCase(),
  redirectTo: z.string().optional(),
});

const IS_DEVELOPMENT = isDevelopmentEnvironment();

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

function buildDirectCallbackUrl(callbackUrl: string, hashedToken: string, type: string) {
  const url = new URL(callbackUrl);
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", type);
  return url.toString();
}

async function sendMagicLink(email: string, callbackUrl: string, locale: AppLocale) {
  try {
    const t = await getLocaleTranslator("ApiAuthMagicLink", locale);

    if (!isResendCustomEmailConfigured()) {
      if (IS_DEVELOPMENT) {
        const supabaseAdmin = createAdminClient();
        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo: callbackUrl },
        });

        if (error) {
          logger.error("Magic link: failed to generate local development link", error);
          return;
        }

        if (!data.properties?.hashed_token) {
          logger.error("Magic link: local development hashed_token missing from Supabase response");
          return;
        }

        const directLink = buildDirectCallbackUrl(
          callbackUrl,
          data.properties.hashed_token,
          "magiclink",
        );
        console.info(`Magic link: local link for ${email}: ${directLink}`);
        return;
      }

      logger.warn("Magic link: Resend is not configured, falling back to Supabase signInWithOtp");
      const supabase = await createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl,
          shouldCreateUser: true,
        },
      });
      if (error) {
        logger.error(
          isProviderOutageError(error)
            ? "Magic link: Supabase signInWithOtp failed (provider outage)"
            : "Magic link: Supabase signInWithOtp failed",
          error,
        );
      }
      return;
    }

    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: callbackUrl },
    });

    if (error) {
      logger.error(
        isProviderOutageError(error)
          ? "Magic link: link generation failed (provider outage)"
          : "Magic link: failed to generate link",
        error,
      );
      return;
    }

    if (!data.properties?.hashed_token) {
      logger.error("Magic link: hashed_token missing from Supabase response");
      return;
    }

    const directLink = buildDirectCallbackUrl(
      callbackUrl,
      data.properties.hashed_token,
      "magiclink",
    );

    try {
      const resend = getResendClientIfConfigured();
      const fromEmail = getResendFromEmailIfConfigured();
      if (!resend || !fromEmail) {
        logger.warn(
          "Magic link: Resend became unavailable during send, falling back to Supabase signInWithOtp",
        );
        const supabase = await createClient();
        const { error: fallbackError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: callbackUrl,
            shouldCreateUser: true,
          },
        });
        if (fallbackError) {
          logger.error(
            isProviderOutageError(fallbackError)
              ? "Magic link: Supabase signInWithOtp fallback failed (provider outage)"
              : "Magic link: Supabase signInWithOtp fallback failed",
            fallbackError,
          );
        }
        return;
      }

      const emailPayload = {
        from: fromEmail,
        to: email,
        subject: t("email.subject"),
        text: [
          t("email.line1"),
          "",
          t("email.useLink"),
          directLink,
          "",
          t("email.ignoreIfNotRequested"),
        ].join("\n"),
      };

      if (isTriggerConfigured()) {
        const triggered = await triggerSendEmailTask(emailPayload);
        if (triggered) {
          return;
        }

        logger.warn("Magic link: Trigger enqueue failed, falling back to inline Resend send");
      }

      await sendResendEmail(emailPayload);
    } catch (sendError) {
      logger.error("Magic link: failed to send email", sendError);
    }
  } catch (error) {
    logger.error("Magic link: delivery failed", error);
  }
}

export async function POST(request: Request) {
  const locale = resolveRequestLocale(request);
  const t = await getLocaleTranslator("ApiAuthMagicLink", locale);
  const requestId = getOrCreateRequestId(request);
  const genericSuccessMessage = t("messages.genericSuccess");
  const genericSuccess = () =>
    withRequestId(jsonSuccess({ message: genericSuccessMessage }), requestId);

  if (getLoginMethod() === "password") {
    return withRequestId(jsonError(t("errors.magicLinkDisabled"), 403), requestId);
  }

  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return withRequestId(csrfError, requestId);
  }

  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) {
    return withRequestId(contentTypeError, requestId);
  }

  const bodyParse = await parseJsonWithSchema(request, magicLinkPayloadSchema);
  if (!bodyParse.success) {
    if (bodyParse.tooLarge) {
      return withRequestId(jsonError(t("errors.payloadTooLarge"), 413), requestId);
    }
    return genericSuccess();
  }
  const { email, redirectTo } = bodyParse.data;
  const clientId = getClientRateLimitIdentifier(request);

  const ipRateLimit = await checkRateLimit({
    key: `magic-link:${clientId.keyType}:${clientId.value}`,
    ...RATE_LIMITS.magicLinkByClient,
  });
  if (!ipRateLimit.allowed) {
    return genericSuccess();
  }

  if (!isValidEmail(email)) {
    return genericSuccess();
  }

  const emailRateLimit = await checkRateLimit({
    key: `magic-link:email:${email}`,
    ...RATE_LIMITS.magicLinkByEmail,
  });
  if (!emailRateLimit.allowed) {
    return genericSuccess();
  }

  const nextPath = getSafeNextPath(redirectTo ?? null);
  const callbackUrl = `${getAppUrl()}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  if (IS_DEVELOPMENT) {
    await sendMagicLink(email, callbackUrl, locale);
  } else {
    after(() => sendMagicLink(email, callbackUrl, locale));
  }

  return genericSuccess();
}
