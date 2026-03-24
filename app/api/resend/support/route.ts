import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { withAuthedRoute } from "@/lib/http/authed-route";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import {
  getResendClientIfConfigured,
  getResendFromEmailIfConfigured,
  getResendSupportEmailIfConfigured,
  isResendSupportEmailConfigured,
  sendResendEmail,
} from "@/lib/resend/server";
import { logger } from "@/lib/logger";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { isTriggerConfigured } from "@/lib/trigger/config";
import { triggerSendEmailTask } from "@/lib/trigger/dispatch";

const supportPayloadSchema = z.object({
  subject: z
    .string()
    .max(120)
    .optional()
    .default("")
    .transform((value) => value.trim().replace(/[\r\n]+/g, " ")),
  message: z.string().trim().min(10).max(2000),
});

export async function POST(request: Request) {
  const t = await getRouteTranslator("ApiSupport", request);

  return withAuthedRoute({
    request,
    requireJsonBody: true,
    unauthorizedMessage: t("errors.unauthorized"),
    rateLimits: ({ request: req, userId }) => {
      const clientId = getClientRateLimitIdentifier(req);
      return [
        {
          key: `support:user:${userId}`,
          ...RATE_LIMITS.supportByUser,
          message: t("errors.rateLimited"),
        },
        {
          key: `support:${clientId.keyType}:${clientId.value}`,
          ...RATE_LIMITS.supportByClient,
          message: t("errors.rateLimited"),
        },
      ];
    },
    handler: async ({ request: req, user }) => {
      const bodyParse = await parseJsonWithSchema(req, supportPayloadSchema);
      if (!bodyParse.success) {
        if (bodyParse.tooLarge) {
          return jsonError(t("errors.payloadTooLarge"), 413);
        }
        const issuePath = bodyParse.error.issues[0]?.path?.[0];
        const issueCode = bodyParse.error.issues[0]?.code;
        if (issuePath === "subject" && issueCode === "too_big") {
          return jsonError(t("errors.subjectTooLong"), 400);
        }
        if (issuePath === "message" && issueCode === "too_small") {
          return jsonError(t("errors.messageTooShort"), 400);
        }
        if (issuePath === "message" && issueCode === "too_big") {
          return jsonError(t("errors.messageTooLong"), 400);
        }
        return jsonError(t("errors.invalidPayload"), 400);
      }
      const { subject, message } = bodyParse.data;

      if (!isResendSupportEmailConfigured()) {
        logger.warn("Support email is disabled because Resend is not fully configured", {
          userId: user.id,
        });
        return jsonError(t("errors.featureDisabled"), 503);
      }

      try {
        const resend = getResendClientIfConfigured();
        const fromEmail = getResendFromEmailIfConfigured();
        const supportEmail = getResendSupportEmailIfConfigured();
        if (!resend || !fromEmail || !supportEmail) {
          logger.warn("Support email send skipped because Resend became unavailable mid-request", {
            userId: user.id,
          });
          return jsonError(t("errors.featureDisabled"), 503);
        }
        const submittedBy = user.email ?? t("email.unknownEmail");
        const renderedSubject =
          subject.length > 0
            ? t("email.subjectWithInput", { subject })
            : t("email.defaultSubject");

        const emailPayload = {
          from: fromEmail,
          to: supportEmail,
          subject: renderedSubject,
          text: [
            t("email.line1"),
            "",
            t("email.userId", { userId: user.id }),
            t("email.email", { email: submittedBy }),
            "",
            t("email.messageLabel"),
            message,
          ].join("\n"),
          replyTo: user.email ?? undefined,
        };

        if (isTriggerConfigured()) {
          const triggered = await triggerSendEmailTask(emailPayload);
          if (!triggered) {
            logger.warn("Support email Trigger enqueue failed, falling back to inline Resend send", {
              userId: user.id,
            });
            await sendResendEmail(emailPayload);
          }
        } else {
          await sendResendEmail(emailPayload);
        }

        return jsonSuccess();
      } catch (error) {
        logger.error("Failed to send support email", error);
        return jsonError(t("errors.unableToSend"), 500);
      }
    },
  });
}
