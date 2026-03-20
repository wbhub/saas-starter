import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/team/invites/[inviteId]/resend", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("logs failure outcome when email delivery fails", async () => {
    const logAuditEvent = vi.fn();
    const send = vi.fn().mockRejectedValue(new Error("resend down"));
    const updateEqTeamId = vi.fn().mockResolvedValue({ error: null });
    const updateEqId = vi.fn().mockReturnValue({ eq: updateEqTeamId });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "person@example.com", role: "member" },
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
              update: vi.fn(() => ({ eq: updateEqId })),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));
    vi.doMock("@/lib/team-context", () => ({
      getTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      getResendClient: () => ({ emails: { send } }),
      getResendFromEmail: () => "noreply@example.com",
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
      new Request(
        "http://localhost/api/team/invites/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/resend",
        { method: "POST" },
      ),
      {
        params: Promise.resolve({
          inviteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      inviteUrl: "http://localhost:3000/invite/token-123",
      emailSent: false,
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "team.invite.resend",
        outcome: "failure",
      }),
    );
  });
});
