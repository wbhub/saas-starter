import { Resend } from "resend";
import { env } from "@/lib/env";

let resend: Resend | null = null;

function getOptionalEnv(getter: () => string): string | undefined {
  try {
    return getter();
  } catch {
    return undefined;
  }
}

export function isResendCustomEmailConfigured() {
  return Boolean(getOptionalEnv(() => env.RESEND_API_KEY) && getOptionalEnv(() => env.RESEND_FROM_EMAIL));
}

export function isResendSupportEmailConfigured() {
  return Boolean(
    getOptionalEnv(() => env.RESEND_API_KEY) &&
      getOptionalEnv(() => env.RESEND_FROM_EMAIL) &&
      getOptionalEnv(() => env.RESEND_SUPPORT_EMAIL),
  );
}

export function getResendClientIfConfigured() {
  const apiKey = getOptionalEnv(() => env.RESEND_API_KEY);
  if (!apiKey) {
    return null;
  }

  if (!resend) {
    resend = new Resend(apiKey);
  }

  return resend;
}

export function getResendClient() {
  const apiKey = env.RESEND_API_KEY;

  if (!resend) {
    resend = new Resend(apiKey);
  }

  return resend;
}

export function getResendFromEmail() {
  return env.RESEND_FROM_EMAIL;
}

export function getResendFromEmailIfConfigured() {
  return getOptionalEnv(() => env.RESEND_FROM_EMAIL) ?? null;
}

export function getResendSupportEmail() {
  return env.RESEND_SUPPORT_EMAIL;
}

export function getResendSupportEmailIfConfigured() {
  return getOptionalEnv(() => env.RESEND_SUPPORT_EMAIL) ?? null;
}

export type ResendEmailPayload = {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

export async function sendResendEmail(payload: ResendEmailPayload) {
  const resendClient = getResendClientIfConfigured();
  if (!resendClient) {
    throw new Error("Resend is not configured.");
  }

  await resendClient.emails.send({
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    replyTo: payload.replyTo,
  });
}
