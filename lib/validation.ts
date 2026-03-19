import { z } from "zod";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HAS_UPPERCASE_RE = /[A-Z]/;
const HAS_LOWERCASE_RE = /[a-z]/;
const HAS_NUMBER_RE = /\d/;
const HAS_SYMBOL_RE = /[^A-Za-z0-9]/;
const HAS_WHITESPACE_RE = /\s/;

const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "12345678910",
  "1234567",
  "123123123",
  "12121212",
  "00000000",
  "99999999",
  "87654321",
  "11111111",
  "22222222",
  "33333333",
  "44444444",
  "55555555",
  "66666666",
  "77777777",
  "88888888",
  "qwertyui",
  "qwertyuiop",
  "qwerty123",
  "qwerty12",
  "qwerty1!",
  "asdfghjk",
  "asdf1234",
  "zxcvbnm1",
  "zxcvbnm!",
  "1q2w3e4r",
  "1q2w3e4r5t",
  "1qaz2wsx",
  "1qazxsw2",
  "zaq12wsx",
  "passw0rd",
  "p@ssw0rd",
  "p@ssword",
  "password!",
  "password1234",
  "password12",
  "password",
  "password1",
  "password123",
  "password@123",
  "password2024",
  "password2025",
  "password2026",
  "password2027",
  "password2028",
  "password2029",
  "password2030",
  "admin123",
  "adminadmin",
  "administrator",
  "root12345",
  "superuser",
  "testtest",
  "testing123",
  "guest1234",
  "welcome1",
  "welcome!",
  "welcome2024",
  "letmein123",
  "letmein!",
  "letmein1",
  "welcome123",
  "changeme123",
  "changeme1",
  "changeme!",
  "newpassword",
  "default123",
  "temp12345",
  "iloveyou",
  "iloveyou1",
  "lovely123",
  "sunshine1",
  "football1",
  "baseball1",
  "monkey123",
  "dragon123",
  "master123",
  "freedom1",
  "whatever1",
  "trustno1",
  "secret123",
  "secret12",
  "abc12345",
  "abcd1234",
  "abc123456",
  "computer",
  "computer1",
  "internet",
  "internet1",
  "qwe12345",
  "qweasdzx",
  "qazwsxed",
  "michael1",
  "jessica1",
  "charlie1",
  "thomas12",
  "soccer12",
  "hockey12",
  "mustang1",
  "starwars",
  "pokemon1",
  "batman12",
  "naruto12",
  "linkedin",
  "linkedin1",
  "facebook",
  "facebook1",
  "google123",
  "apple123",
  "welcomehome",
  "mycompany",
  "company123",
  "saasstarter",
  "aaaaaaaa",
  "aaaaaaaa1!",
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
