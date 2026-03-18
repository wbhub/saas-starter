import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getResendClient,
  getResendFromEmail,
  getResendSupportEmail,
} from "@/lib/resend/server";

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

  const body = (await request.json().catch(() => null)) as SupportPayload | null;
  const subject = body?.subject?.trim() ?? "";
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
      replyTo: user.email,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Unable to send email: ${reason}` },
      { status: 500 },
    );
  }
}
