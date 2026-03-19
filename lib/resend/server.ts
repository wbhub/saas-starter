import { Resend } from "resend";
import { env } from "@/lib/env";

let resend: Resend | null = null;

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

export function getResendSupportEmail() {
  return env.RESEND_SUPPORT_EMAIL;
}
