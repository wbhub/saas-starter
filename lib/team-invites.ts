import { createHash, randomBytes } from "node:crypto";
import { DAY_MS } from "@/lib/constants/durations";

export const TEAM_INVITE_TTL_DAYS = 7;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createRawInviteToken() {
  return randomBytes(24).toString("base64url");
}

export function getInviteExpiryIso(now = new Date()) {
  return new Date(now.getTime() + TEAM_INVITE_TTL_DAYS * DAY_MS).toISOString();
}

export function isInviteRole(value: string): value is "owner" | "admin" | "member" {
  return value === "owner" || value === "admin" || value === "member";
}
