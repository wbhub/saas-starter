import { NextResponse } from "next/server";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import {
  getResendClient,
  getResendFromEmail,
  getResendSupportEmail,
} from "@/lib/resend/server";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { logger } from "@/lib/logger";
import { getRouteTranslator } from "@/lib/i18n/locale";
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

  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: t("errors.unauthorized") }, { status: 401 });
  }

  const clientId = getClientRateLimitIdentifier(request);
  const userRateLimitPromise = checkRateLimit({
    key: `support:user:${user.id}`,
    ...RATE_LIMITS.supportByUser,
  });

  const ipRateLimitPromise = checkRateLimit({
    key: `support:${clientId.keyType}:${clientId.value}`,
    ...RATE_LIMITS.supportByClient,
  });

  const [userRateLimit, ipRateLimit] = await Promise.all([
    userRateLimitPromise,
    ipRateLimitPromise,
  ]);

  if (!userRateLimit.allowed || !ipRateLimit.allowed) {
    const retryAfterSeconds = Math.max(
      userRateLimit.retryAfterSeconds,
      ipRateLimit.retryAfterSeconds,
    );
    return NextResponse.json(
      { error: t("errors.rateLimited") },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      },
    );
  }

  const bodyParse = await parseJsonWithSchema(request, supportPayloadSchema);
  if (!bodyParse.success) {
    if (bodyParse.tooLarge) {
      return NextResponse.json({ error: t("errors.payloadTooLarge") }, { status: 413 });
    }
    const issuePath = bodyParse.error.issues[0]?.path?.[0];
    const issueCode = bodyParse.error.issues[0]?.code;
    if (issuePath === "subject" && issueCode === "too_big") {
      return NextResponse.json(
        { error: t("errors.subjectTooLong") },
        { status: 400 },
      );
    }
    if (issuePath === "message" && issueCode === "too_small") {
      return NextResponse.json(
        { error: t("errors.messageTooShort") },
        { status: 400 },
      );
    }
    if (issuePath === "message" && issueCode === "too_big") {
      return NextResponse.json(
        { error: t("errors.messageTooLong") },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: t("errors.invalidPayload") },
      { status: 400 },
    );
  }
  const { subject, message } = bodyParse.data;

  try {
    const resend = getResendClient();
    const fromEmail = getResendFromEmail();
    const supportEmail = getResendSupportEmail();
    const submittedBy = user.email ?? t("email.unknownEmail");
    const renderedSubject =
      subject.length > 0
        ? t("email.subjectWithInput", { subject })
        : t("email.defaultSubject");

    await resend.emails.send({
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
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Failed to send support email", error);
    return NextResponse.json(
      { error: t("errors.unableToSend") },
      { status: 500 },
    );
  }
}
