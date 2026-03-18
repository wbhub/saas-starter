import { Resend } from "resend";

let resend: Resend | null = null;

export function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("Missing required environment variable: RESEND_API_KEY");
  }

  if (!resend) {
    resend = new Resend(apiKey);
  }

  return resend;
}

export function getResendFromEmail() {
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!fromEmail) {
    throw new Error("Missing required environment variable: RESEND_FROM_EMAIL");
  }

  return fromEmail;
}

export function getResendSupportEmail() {
  const supportEmail = process.env.RESEND_SUPPORT_EMAIL;

  if (!supportEmail) {
    throw new Error(
      "Missing required environment variable: RESEND_SUPPORT_EMAIL",
    );
  }

  return supportEmail;
}
