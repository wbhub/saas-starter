import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/team/invites/[inviteId]/resend", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
  });

  it("returns 403 when an admin tries to resend an owner invite", async () => {
    const send = vi.fn();
    const update = vi.fn();
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        email: "person@example.com",
        role: "owner",
        token_hash: "previous-hash",
        expires_at: "2026-06-01T00:00:00.000Z",
        invited_by: "user_previous",
      },
      error: null,
    });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: "user_1", email: "admin@example.com" } } }),
        },
        from: vi.fn((table: string) => {
          if (table === "team_invites") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle,
              update,
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme",
        role: "admin",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendCustomEmailConfigured: () => true,
      getResendClientIfConfigured: () => ({ emails: { send } }),
      getResendFromEmailIfConfigured: () => "noreply@example.com",
      sendResendEmail: vi.fn(async () => {
        await send();
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/team/invites/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/resend", {
        method: "POST",
      }),
      {
        params: Promise.resolve({
          inviteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Only team owners can resend owner invites.",
    });
    expect(update).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("logs failure outcome when email delivery fails", async () => {
    const logAuditEvent = vi.fn();
    const send = vi.fn().mockRejectedValue(new Error("resend down"));
    const update = vi.fn(() => {
      const query = {
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({ error: null }),
      };
      return query;
    });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        email: "person@example.com",
        role: "member",
        token_hash: "previous-hash",
        expires_at: "2026-06-01T00:00:00.000Z",
        invited_by: "user_previous",
      },
      error: null,
    });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: "user_1", email: "owner@example.com" } } }),
        },
        from: vi.fn((table: string) => {
          if (table === "team_invites") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle,
              update,
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendCustomEmailConfigured: () => true,
      getResendClientIfConfigured: () => ({ emails: { send } }),
      getResendFromEmailIfConfigured: () => "noreply@example.com",
      sendResendEmail: vi.fn(async () => {
        await send();
      }),
    }));
    vi.doMock("@/lib/audit", () => ({
      logAuditEvent,
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));
    vi.doMock("@/lib/team-invites", () => ({
      createRawInviteToken: vi.fn(() => "token-123"),
      hashInviteToken: vi.fn(() => "hash-123"),
      getInviteExpiryIso: vi.fn(() => "2026-12-31T00:00:00.000Z"),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/team/invites/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/resend", {
        method: "POST",
      }),
      {
        params: Promise.resolve({
          inviteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      emailSent: false,
      deliveryStatus: "failed_preserved",
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "team.invite.resend",
        outcome: "failure",
        metadata: expect.objectContaining({
          emailSent: false,
          deliveryStatus: "failed_preserved",
          emailFailureReason: "resend_send_failed",
        }),
      }),
    );
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        token_hash: "previous-hash",
        expires_at: "2026-06-01T00:00:00.000Z",
        invited_by: "user_previous",
      }),
    );
  });

  it("returns emailSent false when Resend is not configured", async () => {
    const logAuditEvent = vi.fn();
    const update = vi.fn();
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        email: "person@example.com",
        role: "member",
        token_hash: "previous-hash",
        expires_at: "2026-06-01T00:00:00.000Z",
        invited_by: "user_previous",
      },
      error: null,
    });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: "user_1", email: "owner@example.com" } } }),
        },
        from: vi.fn((table: string) => {
          if (table === "team_invites") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle,
              update,
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendCustomEmailConfigured: () => false,
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));
    vi.doMock("@/lib/audit", () => ({
      logAuditEvent,
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));
    vi.doMock("@/lib/team-invites", () => ({
      createRawInviteToken: vi.fn(() => "token-123"),
      hashInviteToken: vi.fn(() => "hash-123"),
      getInviteExpiryIso: vi.fn(() => "2026-12-31T00:00:00.000Z"),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/team/invites/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/resend", {
        method: "POST",
      }),
      {
        params: Promise.resolve({
          inviteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      emailSent: false,
      deliveryStatus: "failed_preserved",
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "team.invite.resend",
        outcome: "failure",
        metadata: expect.objectContaining({
          emailSent: false,
          deliveryStatus: "failed_preserved",
          emailFailureReason: "resend_not_configured",
        }),
      }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("returns failed_rotated when resend fails and rollback also fails", async () => {
    const logAuditEvent = vi.fn();
    const send = vi.fn().mockRejectedValue(new Error("resend down"));
    const updateResponses = [{ error: { message: "rollback failed" } }];
    const update = vi.fn(() => {
      const query = {
        eq: vi.fn().mockReturnThis(),
        is: vi
          .fn()
          .mockImplementation(() => Promise.resolve(updateResponses.shift() ?? { error: null })),
      };
      return query;
    });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        email: "person@example.com",
        role: "member",
        token_hash: "previous-hash",
        expires_at: "2026-06-01T00:00:00.000Z",
        invited_by: "user_previous",
      },
      error: null,
    });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: "user_1", email: "owner@example.com" } } }),
        },
        from: vi.fn((table: string) => {
          if (table === "team_invites") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle,
              update,
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendCustomEmailConfigured: () => true,
      getResendClientIfConfigured: () => ({ emails: { send } }),
      getResendFromEmailIfConfigured: () => "noreply@example.com",
      sendResendEmail: vi.fn(async () => {
        await send();
      }),
    }));
    vi.doMock("@/lib/audit", () => ({
      logAuditEvent,
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));
    vi.doMock("@/lib/team-invites", () => ({
      createRawInviteToken: vi.fn(() => "token-123"),
      hashInviteToken: vi.fn(() => "hash-123"),
      getInviteExpiryIso: vi.fn(() => "2026-12-31T00:00:00.000Z"),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/team/invites/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/resend", {
        method: "POST",
      }),
      {
        params: Promise.resolve({
          inviteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      emailSent: false,
      deliveryStatus: "failed_rotated",
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "team.invite.resend",
        outcome: "failure",
        metadata: expect.objectContaining({
          emailSent: false,
          deliveryStatus: "failed_rotated",
          emailFailureReason: "resend_send_failed",
        }),
      }),
    );
  });
});
