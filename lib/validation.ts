import { z } from "zod";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_SCHEMA = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .email()
  .refine((email) => !email.includes(".."), {
    message: "Email contains consecutive dots.",
  })
  .refine((email) => {
    const [localPart = "", domain = ""] = email.split("@");
    if (!localPart || !domain || localPart.length > 64) {
      return false;
    }

    const labels = domain.split(".");
    if (labels.length < 2) {
      return false;
    }

    const tld = labels[labels.length - 1] ?? "";
    if (tld.length < 2) {
      return false;
    }

    return labels.every((label) => {
      if (!label || label.length > 63) {
        return false;
      }
      if (!/^[A-Za-z0-9-]+$/.test(label)) {
        return false;
      }
      return !label.startsWith("-") && !label.endsWith("-");
    });
  }, "Invalid email format.");

export function isValidEmail(email: string) {
  if (!EMAIL_RE.test(email)) {
    return false;
  }
  return EMAIL_SCHEMA.safeParse(email).success;
}

export function validatePasswordComplexity(password: string) {
  if (password.length < 12 || password.length > 128) {
    return {
      valid: false,
      error: "Password must be between 12 and 128 characters.",
    };
  }

  return { valid: true, error: "" };
}

export function parsePlanKey(body: unknown) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  const maybePlanKey = payload.planKey;
  if (typeof maybePlanKey !== "string") {
    const maybePriceId = payload.priceId;
    if (typeof maybePriceId !== "string") {
      return null;
    }

    const priceId = maybePriceId.trim();
    if (!priceId) {
      return null;
    }

    if (process.env.STRIPE_STARTER_PRICE_ID?.trim() === priceId) {
      return "starter";
    }
    if (process.env.STRIPE_GROWTH_PRICE_ID?.trim() === priceId) {
      return "growth";
    }
    if (process.env.STRIPE_PRO_PRICE_ID?.trim() === priceId) {
      return "pro";
    }
    return null;
  }

  const planKey = maybePlanKey.trim();
  if (!planKey || planKey.length > 100) {
    return null;
  }

  return planKey;
}
