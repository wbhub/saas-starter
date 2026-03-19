import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getResendClient, getResendFromEmail } from "@/lib/resend/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/http/client-ip";
import { checkRateLimit } from "@/lib/security/rate-limit";

type ForgotPasswordPayload = {
  email?: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const GENERIC_SUCCESS_MESSAGE =
  "If an account exists for that email, a reset link has been sent.";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | ForgotPasswordPayload
    | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const clientIp = getClientIp(request);

  const ipRateLimit = checkRateLimit({
    key: `forgot-password:ip:${clientIp}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!ipRateLimit.allowed) {
    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  }

  const emailRateLimit = checkRateLimit({
    key: `forgot-password:email:${email}`,
    limit: 3,
    windowMs: 10 * 60 * 1000,
  });
  if (!emailRateLimit.allowed) {
    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  }

  try {
    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
      },
    });

    if (!error && data.properties?.action_link) {
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
    }

    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  } catch {
    // Keep response generic to avoid leaking account existence.
    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  }
}
