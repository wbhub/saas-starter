const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string) {
  return EMAIL_RE.test(email);
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
