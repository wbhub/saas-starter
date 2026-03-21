import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/team/invites", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
  });

  it("returns 403 for non-admin members", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "user_123", email: "me@example.com" } } }) },
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme",
        role: "member",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", role: "member" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only team owners and admins can send invites.",
    });
  });

  it("creates invite and sends email for owners/admins", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const cleanupDelete = vi.fn().mockResolvedValue({ error: null });
    const send = vi.fn().mockResolvedValue({});
    const countMembers = vi.fn().mockResolvedValue({ count: 3, error: null });
    const countPendingInvites = vi.fn().mockResolvedValue({ count: 1, error: null });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "owner@example.com" } },
          }),
        },
        from: vi.fn((table: string) => {
          if (table === "team_memberships") {
            return {
              select: vi.fn(() => ({
                eq: countMembers,
              })),
            };
          }
          if (table === "team_invites") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    gt: countPendingInvites,
                  }),
                }),
              })),
              delete: vi.fn(() => ({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      lt: cleanupDelete,
                    }),
                  }),
                }),
              })),
              insert,
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));
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
    vi.doMock("@/lib/team-invites", () => ({
      createRawInviteToken: vi.fn().mockReturnValue("token_abc"),
      getInviteExpiryIso: vi.fn().mockReturnValue("2030-01-01T00:00:00.000Z"),
      hashInviteToken: vi.fn().mockReturnValue("hash_abc"),
      isInviteRole: (value: string) => value === "admin" || value === "member",
      normalizeEmail: (value: string) => value.trim().toLowerCase(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));
    vi.doMock("@/lib/resend/server", () => ({
      getResendClient: () => ({ emails: { send } }),
      getResendFromEmail: () => "SaaS Starter <onboarding@example.com>",
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", role: "admin" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      emailSent: true,
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        team_id: "team_123",
        email: "new@example.com",
        role: "admin",
        token_hash: "hash_abc",
      }),
    );
    expect(cleanupDelete).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
  });

  it("returns 409 when a pending invite already exists", async () => {
    const insert = vi.fn().mockResolvedValue({
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const countMembers = vi.fn().mockResolvedValue({ count: 3, error: null });
    const countPendingInvites = vi.fn().mockResolvedValue({ count: 1, error: null });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "owner@example.com" } },
          }),
        },
        from: vi.fn((table: string) => {
          if (table === "team_memberships") {
            return {
              select: vi.fn(() => ({
                eq: countMembers,
              })),
            };
          }
          if (table === "team_invites") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    gt: countPendingInvites,
                  }),
                }),
              })),
              delete: vi.fn(() => ({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      lt: vi.fn().mockResolvedValue({ error: null }),
                    }),
                  }),
                }),
              })),
              insert,
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));
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
    vi.doMock("@/lib/team-invites", () => ({
      createRawInviteToken: vi.fn().mockReturnValue("token_abc"),
      getInviteExpiryIso: vi.fn().mockReturnValue("2030-01-01T00:00:00.000Z"),
      hashInviteToken: vi.fn().mockReturnValue("hash_abc"),
      isInviteRole: (value: string) => value === "admin" || value === "member",
      normalizeEmail: (value: string) => value.trim().toLowerCase(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));
    vi.doMock("@/lib/resend/server", () => ({
      getResendClient: () => ({ emails: { send: vi.fn() } }),
      getResendFromEmail: () => "SaaS Starter <onboarding@example.com>",
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", role: "member" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "A pending invite already exists for this email.",
    });
  });

  it("retries insert once after duplicate conflict", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({
        error: { code: "23505", message: "duplicate key value violates unique constraint" },
      })
      .mockResolvedValueOnce({ error: null });
    const cleanupDelete = vi.fn().mockResolvedValue({ error: null });
    const send = vi.fn().mockResolvedValue({});
    const countMembers = vi.fn().mockResolvedValue({ count: 3, error: null });
    const countPendingInvites = vi.fn().mockResolvedValue({ count: 1, error: null });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "owner@example.com" } },
          }),
        },
        from: vi.fn((table: string) => {
          if (table === "team_memberships") {
            return {
              select: vi.fn(() => ({
                eq: countMembers,
              })),
            };
          }
          if (table === "team_invites") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    gt: countPendingInvites,
                  }),
                }),
              })),
              delete: vi.fn(() => ({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    is: vi.fn().mockReturnValue({
                      lt: cleanupDelete,
                    }),
                  }),
                }),
              })),
              insert,
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));
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
    vi.doMock("@/lib/team-invites", () => ({
      createRawInviteToken: vi.fn().mockReturnValue("token_abc"),
      getInviteExpiryIso: vi.fn().mockReturnValue("2030-01-01T00:00:00.000Z"),
      hashInviteToken: vi.fn().mockReturnValue("hash_abc"),
      isInviteRole: (value: string) => value === "admin" || value === "member",
      normalizeEmail: (value: string) => value.trim().toLowerCase(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));
    vi.doMock("@/lib/resend/server", () => ({
      getResendClient: () => ({ emails: { send } }),
      getResendFromEmail: () => "SaaS Starter <onboarding@example.com>",
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", role: "member" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      emailSent: true,
    });
    expect(insert).toHaveBeenCalledTimes(2);
    expect(cleanupDelete).toHaveBeenCalledTimes(2);
  });

  it("returns 409 when team member cap is reached", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const countMembers = vi.fn().mockResolvedValue({ count: 100, error: null });
    const countPendingInvites = vi.fn().mockResolvedValue({ count: 0, error: null });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "owner@example.com" } },
          }),
        },
        from: vi.fn((table: string) => {
          if (table === "team_memberships") {
            return {
              select: vi.fn(() => ({
                eq: countMembers,
              })),
            };
          }
          if (table === "team_invites") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    gt: countPendingInvites,
                  }),
                }),
              })),
              delete: vi.fn(),
              insert,
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));
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
    vi.doMock("@/lib/team-invites", () => ({
      createRawInviteToken: vi.fn().mockReturnValue("token_abc"),
      getInviteExpiryIso: vi.fn().mockReturnValue("2030-01-01T00:00:00.000Z"),
      hashInviteToken: vi.fn().mockReturnValue("hash_abc"),
      isInviteRole: (value: string) => value === "admin" || value === "member",
      normalizeEmail: (value: string) => value.trim().toLowerCase(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));
    vi.doMock("@/lib/resend/server", () => ({
      getResendClient: () => ({ emails: { send: vi.fn() } }),
      getResendFromEmail: () => "SaaS Starter <onboarding@example.com>",
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", role: "member" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Team member limit reached. Revoke pending invites or remove members first.",
    });
    expect(insert).not.toHaveBeenCalled();
  });
});
