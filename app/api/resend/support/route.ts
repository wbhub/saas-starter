import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getResendClient,
  getResendFromEmail,
  getResendSupportEmail,
} from "@/lib/resend/server";
import { getClientIp } from "@/lib/http/client-ip";
import { checkRateLimit } from "@/lib/security/rate-limit";

type SupportPayload = {
  subject?: string;
  message?: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIp = getClientIp(request);
  const userRateLimit = checkRateLimit({
    key: `support:user:${user.id}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });

  const ipRateLimit = checkRateLimit({
    key: `support:ip:${clientIp}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });

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

  const body = (await request.json().catch(() => null)) as SupportPayload | null;
  const subject = (body?.subject?.trim() ?? "").replace(/[\r\n]+/g, " ");
  const message = body?.message?.trim() ?? "";

  if (message.length < 10) {
    return NextResponse.json(
      { error: "Message must be at least 10 characters long." },
      { status: 400 },
    );
  }

  if (message.length > 2000) {
    return NextResponse.json(
      { error: "Message must be 2000 characters or less." },
      { status: 400 },
    );
  }

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
    console.error("Failed to send support email", error);
    return NextResponse.json(
      { error: "Unable to send support email right now. Please try again." },
      { status: 500 },
    );
  }
}
