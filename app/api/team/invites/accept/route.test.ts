import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/team/invites/accept", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientRateLimitIdentifier: vi.fn().mockReturnValue({
        keyType: "ip",
        value: "127.0.0.1",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
  });

  it("accepts invite for matching email", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "member@example.com" } },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/team-invites/accept-invite", () => ({
      acceptTeamInvite: vi.fn().mockResolvedValue({
        ok: true,
        teamName: "Acme Team",
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/team/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "token_abc123" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      teamName: "Acme Team",
    });
  });

  it("returns 200 when invite is accepted but seat sync fails", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "member@example.com" } },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/team-invites/accept-invite", () => ({
      acceptTeamInvite: vi.fn().mockResolvedValue({
        ok: true,
        teamName: "Acme Team",
        warning: "seat_sync_failed",
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/team/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "token_abc123" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      warning: "Invite accepted, but billing sync failed. Please retry shortly.",
      inviteAccepted: true,
      teamName: "Acme Team",
    });
  });

  it("returns 409 when team member cap is reached (team_full from RPC)", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "member@example.com" } },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/team-invites/accept-invite", () => ({
      acceptTeamInvite: vi.fn().mockResolvedValue({
        ok: false,
        errorCode: "team_full",
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/team/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "token_abc123" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Team member limit reached. Ask an owner/admin to increase capacity first.",
    });
  });
});
