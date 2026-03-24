import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/team/invites/accept", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
  });

  it("accepts invite for matching email", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ok: true, error_code: null, team_id: "team_123", team_name: "Acme Team" }],
      error: null,
    });
    const syncTeamSeatQuantity = vi.fn().mockResolvedValue({
      updated: true,
      previousQuantity: 1,
      seatCount: 2,
    });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "member@example.com" } },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ rpc }),
    }));
    vi.doMock("@/lib/team-invites", () => ({
      hashInviteToken: vi.fn().mockReturnValue("hash_123"),
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
    vi.doMock("@/lib/stripe/seats", () => ({
      syncTeamSeatQuantity,
    }));
    vi.doMock("@/lib/stripe/seat-sync-retries", () => ({
      enqueueSeatSyncRetry: vi.fn().mockResolvedValue(undefined),
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
    expect(rpc).toHaveBeenCalledWith("accept_team_invite_atomic", {
      p_token_hash: "hash_123",
      p_user_id: "user_123",
      p_user_email: "member@example.com",
      p_max_members: 100,
    });
    expect(syncTeamSeatQuantity).toHaveBeenCalledWith("team_123", {
      idempotencyKey: "seat-sync:accept-invite:team_123:user_123",
    });
  });

  it("returns 200 when invite is accepted but seat sync fails", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ok: true, error_code: null, team_id: "team_123", team_name: "Acme Team" }],
      error: null,
    });
    const syncTeamSeatQuantity = vi.fn().mockRejectedValue(new Error("stripe seat update failed"));

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "member@example.com" } },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ rpc }),
    }));
    vi.doMock("@/lib/team-invites", () => ({
      hashInviteToken: vi.fn().mockReturnValue("hash_123"),
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
    vi.doMock("@/lib/stripe/seats", () => ({
      syncTeamSeatQuantity,
    }));
    vi.doMock("@/lib/stripe/seat-sync-retries", () => ({
      enqueueSeatSyncRetry: vi.fn().mockResolvedValue(undefined),
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
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ok: false, error_code: "team_full", team_id: "team_123", team_name: null }],
      error: null,
    });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "member@example.com" } },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ rpc }),
    }));
    vi.doMock("@/lib/team-invites", () => ({
      hashInviteToken: vi.fn().mockReturnValue("hash_123"),
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
    vi.doMock("@/lib/stripe/seats", () => ({
      syncTeamSeatQuantity: vi.fn(),
    }));
    vi.doMock("@/lib/stripe/seat-sync-retries", () => ({
      enqueueSeatSyncRetry: vi.fn().mockResolvedValue(undefined),
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
    expect(rpc).toHaveBeenCalledWith("accept_team_invite_atomic", {
      p_token_hash: "hash_123",
      p_user_id: "user_123",
      p_user_email: "member@example.com",
      p_max_members: 100,
    });
  });
});
