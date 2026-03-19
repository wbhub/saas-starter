import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getResendClient, getResendFromEmail } from "@/lib/resend/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/http/client-ip";
import { requireJsonContentType } from "@/lib/http/content-type";
import { checkRateLimit } from "@/lib/security/rate-limit";

type ForgotPasswordPayload = {
  email?: string;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const GENERIC_SUCCESS_MESSAGE =
  "If an account exists for that email, a reset link has been sent.";
const GENERIC_FAILURE_MESSAGE =
  "Unable to process password reset requests right now. Please try again shortly.";
const UNKNOWN_IP_RATE_LIMIT_KEY = "unknown";

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

export async function POST(request: Request) {
  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const body = (await request.json().catch(() => null)) as
    | ForgotPasswordPayload
    | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const clientIp = getClientIp(request) ?? UNKNOWN_IP_RATE_LIMIT_KEY;
  const ipRateLimit = await checkRateLimit({
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

  const emailRateLimit = await checkRateLimit({
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

    if (error) {
      console.error("Failed to generate password reset link", error);
      if (isProviderOutageError(error)) {
        return NextResponse.json({ message: GENERIC_FAILURE_MESSAGE }, { status: 503 });
      }
      return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
    }

    if (!data.properties?.action_link) {
      console.error("Password reset link missing from Supabase response");
      return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
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
    } catch (error) {
      console.error("Failed to send password reset email", error);
      return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
    }

    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  } catch (error) {
    // Keep response generic to avoid leaking account existence.
    console.error("Forgot-password route failed", error);
    if (isProviderOutageError(error)) {
      return NextResponse.json({ message: GENERIC_FAILURE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  }
}
