import { z } from "zod";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HAS_UPPERCASE_RE = /[A-Z]/;
const HAS_LOWERCASE_RE = /[a-z]/;
const HAS_NUMBER_RE = /\d/;
const HAS_SYMBOL_RE = /[^A-Za-z0-9]/;
const HAS_WHITESPACE_RE = /\s/;

const COMMON_PASSWORDS = new Set([
  "12345678",
  "87654321",
  "11111111",
  "qwertyui",
  "qwertyuiop",
  "password",
  "password1",
  "password123",
  "letmein123",
  "welcome123",
  "changeme123",
  "aaaaaaaa",
]);

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
  if (password.length < 8 || password.length > 128) {
    return {
      valid: false,
      error: "Password must be between 8 and 128 characters.",
    };
  }

  if (HAS_WHITESPACE_RE.test(password)) {
    return {
      valid: false,
      error: "Password cannot contain spaces.",
    };
  }

  if (!HAS_UPPERCASE_RE.test(password)) {
    return {
      valid: false,
      error: "Password must include at least one uppercase letter.",
    };
  }

  if (!HAS_LOWERCASE_RE.test(password)) {
    return {
      valid: false,
      error: "Password must include at least one lowercase letter.",
    };
  }

  if (!HAS_NUMBER_RE.test(password)) {
    return {
      valid: false,
      error: "Password must include at least one number.",
    };
  }

  if (!HAS_SYMBOL_RE.test(password)) {
    return {
      valid: false,
      error: "Password must include at least one symbol.",
    };
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return {
      valid: false,
      error: "Please choose a less common password.",
    };
  }

  return { valid: true, error: "" };
}

export function parsePlanKey(body: unknown) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const maybePlanKey = (body as Record<string, unknown>).planKey;
  if (typeof maybePlanKey !== "string") {
    return null;
  }

  const planKey = maybePlanKey.trim();
  if (!planKey || planKey.length > 100) {
    return null;
  }

  return planKey;
}
