import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DELETE /api/team/invites/[inviteId]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
  });

  function mockAuthedContext(role: "owner" | "admin" | "member" = "owner") {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role,
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
  }

  function mockInviteDeleteResult(result: {
    data: { id: string } | null;
    error: { message: string } | null;
  }) {
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const is = vi.fn().mockReturnValue({ select });
    const eqTeamId = vi.fn().mockReturnValue({ is });
    const eqId = vi.fn().mockReturnValue({ eq: eqTeamId });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqId });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
          }),
        },
        from: vi.fn((table: string) => {
          if (table === "team_invites") {
            return { delete: deleteMock };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));

    return { maybeSingle, eqTeamId, is };
  }

  it("returns 400 when inviteId is not a UUID", async () => {
    mockAuthedContext("owner");

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/team/invites/not-a-uuid", { method: "DELETE" }),
      {
        params: Promise.resolve({ inviteId: "not-a-uuid" }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Invalid invite id.",
    });
  });

  it("returns 401 when not authenticated", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: null } }),
        },
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn(),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn(),
    }));

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/team/invites/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ inviteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unauthorized",
    });
  });

  it("returns 403 when no team membership exists", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn(),
    }));

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/team/invites/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ inviteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "No team membership found for this account.",
    });
  });

  it("returns 403 for non-owner/admin roles", async () => {
    mockAuthedContext("member");

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/team/invites/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ inviteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Only team owners and admins can revoke invites.",
    });
  });

  it("returns 404 when no pending invite matches team and inviteId", async () => {
    const logAuditEvent = vi.fn();
    vi.doMock("@/lib/audit", () => ({ logAuditEvent }));
    vi.doMock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    mockInviteDeleteResult({ data: null, error: null });

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/team/invites/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ inviteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Pending invite not found.",
    });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("returns 500 and logs audit failure on delete error", async () => {
    const logAuditEvent = vi.fn();
    const loggerError = vi.fn();
    vi.doMock("@/lib/audit", () => ({ logAuditEvent }));
    vi.doMock("@/lib/logger", () => ({ logger: { error: loggerError } }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "admin",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    mockInviteDeleteResult({ data: null, error: { message: "db failed" } });

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/team/invites/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ inviteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unable to revoke invite.",
    });
    expect(loggerError).toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "team.invite.revoke",
        outcome: "failure",
        teamId: "team_123",
        resourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        metadata: { reason: "delete_error" },
      }),
    );
  });

  it("returns 200 and logs success when invite is revoked", async () => {
    const logAuditEvent = vi.fn();
    vi.doMock("@/lib/audit", () => ({ logAuditEvent }));
    vi.doMock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    const { eqTeamId, is } = mockInviteDeleteResult({
      data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      error: null,
    });

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/team/invites/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ inviteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(eqTeamId).toHaveBeenCalledWith("team_id", "team_123");
    expect(is).toHaveBeenCalledWith("accepted_at", null);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "team.invite.revoke",
        outcome: "success",
        teamId: "team_123",
        resourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    );
  });
});
