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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      },
    );
  }

  const bodyParse = await parseJsonWithSchema(request, supportPayloadSchema);
  if (!bodyParse.success) {
    if (bodyParse.tooLarge) {
      return NextResponse.json({ error: "Request payload is too large." }, { status: 413 });
    }
    const issuePath = bodyParse.error.issues[0]?.path?.[0];
    const issueCode = bodyParse.error.issues[0]?.code;
    if (issuePath === "subject" && issueCode === "too_big") {
      return NextResponse.json(
        { error: "Subject must be 120 characters or less." },
        { status: 400 },
      );
    }
    if (issuePath === "message" && issueCode === "too_small") {
      return NextResponse.json(
        { error: "Message must be at least 10 characters long." },
        { status: 400 },
      );
    }
    if (issuePath === "message" && issueCode === "too_big") {
      return NextResponse.json(
        { error: "Message must be 2000 characters or less." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Invalid support request payload." },
      { status: 400 },
    );
  }
  const { subject, message } = bodyParse.data;

  try {
    const resend = getResendClient();
    const fromEmail = getResendFromEmail();
    const supportEmail = getResendSupportEmail();
    const submittedBy = user.email ?? "Unknown email";
    const renderedSubject =
      subject.length > 0
        ? `[Dashboard Support] ${subject}`
        : "[Dashboard Support] New message";

    await resend.emails.send({
      from: fromEmail,
      to: supportEmail,
      subject: renderedSubject,
      text: [
        "New support message from your SaaS Starter dashboard.",
        "",
        `User ID: ${user.id}`,
        `Email: ${submittedBy}`,
        "",
        "Message:",
        message,
      ].join("\n"),
      replyTo: user.email ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Failed to send support email", error);
    return NextResponse.json(
      { error: "Unable to send support email right now. Please try again." },
      { status: 500 },
    );
  }
}
