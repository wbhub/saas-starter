import { Resend } from "resend";
import { env } from "@/lib/env";

let resend: Resend | null = null;
type ResendEnvKey = "RESEND_API_KEY" | "RESEND_FROM_EMAIL" | "RESEND_SUPPORT_EMAIL";

function getTrimmedResendEnv(key: ResendEnvKey) {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function isResendCustomEmailConfigured() {
  return Boolean(getTrimmedResendEnv("RESEND_API_KEY") && getTrimmedResendEnv("RESEND_FROM_EMAIL"));
}

export function isResendSupportEmailConfigured() {
  return Boolean(
    getTrimmedResendEnv("RESEND_API_KEY") &&
      getTrimmedResendEnv("RESEND_FROM_EMAIL") &&
      getTrimmedResendEnv("RESEND_SUPPORT_EMAIL"),
  );
}

export function getResendClientIfConfigured() {
  const apiKey = getTrimmedResendEnv("RESEND_API_KEY");
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
  return getTrimmedResendEnv("RESEND_FROM_EMAIL") ?? null;
}

export function getResendSupportEmail() {
  return env.RESEND_SUPPORT_EMAIL;
}

export function getResendSupportEmailIfConfigured() {
  return getTrimmedResendEnv("RESEND_SUPPORT_EMAIL") ?? null;
}
