import { describe, expect, it } from "vitest";
import {
  TEAM_INVITE_TTL_DAYS,
  createRawInviteToken,
  getInviteExpiryIso,
  hashInviteToken,
  isInviteRole,
  normalizeEmail,
} from "./team-invites";

describe("team invite helpers", () => {
  it("creates URL-safe invite tokens with expected entropy length", () => {
    const token = createRawInviteToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBe(32);
  });

  it("hashes the same token deterministically", () => {
    const token = "invite_abc123";
    const first = hashInviteToken(token);
    const second = hashInviteToken(token);

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("uses a seven-day default expiry window", () => {
    const now = new Date("2026-03-10T12:00:00.000Z");
    const expiry = getInviteExpiryIso(now);
    const diffMs = new Date(expiry).getTime() - now.getTime();

    expect(diffMs).toBe(TEAM_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  });

  it("normalizes emails by trimming and lowercasing", () => {
    expect(normalizeEmail("  TeSt.User+tag@Example.COM  ")).toBe("test.user+tag@example.com");
  });

  it("accepts owner/admin/member invite roles", () => {
    expect(isInviteRole("owner")).toBe(true);
    expect(isInviteRole("admin")).toBe(true);
    expect(isInviteRole("member")).toBe(true);
    expect(isInviteRole("superadmin")).toBe(false);
    expect(isInviteRole("")).toBe(false);
  });
});
