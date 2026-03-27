"use client";

export const RECOVERY_MARKER_KEY = "saas-starter-password-recovery";
const RECOVERY_MARKER_MAX_AGE_MS = 15 * 60 * 1000;

export function saveRecoveryMarker() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(RECOVERY_MARKER_KEY, JSON.stringify({ issuedAt: Date.now() }));
}

export function clearRecoveryMarker() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(RECOVERY_MARKER_KEY);
}

export function hasValidRecoveryMarker() {
  if (typeof window === "undefined") {
    return false;
  }

  const raw = window.sessionStorage.getItem(RECOVERY_MARKER_KEY);
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw) as { issuedAt?: unknown };
    if (typeof parsed.issuedAt !== "number") {
      return false;
    }
    return Date.now() - parsed.issuedAt <= RECOVERY_MARKER_MAX_AGE_MS;
  } catch {
    return false;
  }
}
