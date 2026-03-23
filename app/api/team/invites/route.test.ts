import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/team/invites", () => {
  function createSubscriptionsTable(hasLive = true) {
    return {
      select: vi.fn(() => ({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: hasLive ? { stripe_subscription_id: "sub_123" } : null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      })),
    };
  }

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
      ok: false,
      error: "Only team owners and admins can send invites.",
    });
  });

  it("creates invite and sends email for owners/admins", async () => {
    const logAuditEvent = vi.fn();
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
          if (table === "subscriptions") {
            return createSubscriptionsTable(true);
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
      isResendCustomEmailConfigured: () => true,
      getResendClientIfConfigured: () => ({ emails: { send } }),
      getResendFromEmailIfConfigured: () => "SaaS Starter <onboarding@example.com>",
      sendResendEmail: vi.fn(async () => {
        await send();
      }),
    }));
    vi.doMock("@/lib/audit", () => ({
      logAuditEvent,
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
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "team.invite.create",
        outcome: "success",
        metadata: expect.objectContaining({
          emailSent: true,
          emailFailureReason: undefined,
        }),
      }),
    );
  });

  it("creates invite and returns emailSent false when Resend is not configured", async () => {
    const logAuditEvent = vi.fn();
    const insert = vi.fn().mockResolvedValue({ error: null });
    const cleanupDelete = vi.fn().mockResolvedValue({ error: null });
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
          if (table === "subscriptions") {
            return createSubscriptionsTable(true);
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
      isResendCustomEmailConfigured: () => false,
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));
    vi.doMock("@/lib/audit", () => ({
      logAuditEvent,
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
      emailSent: false,
    });
    expect(insert).toHaveBeenCalledOnce();
    expect(cleanupDelete).toHaveBeenCalledOnce();
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "team.invite.create",
        outcome: "success",
        metadata: expect.objectContaining({
          emailSent: false,
          emailFailureReason: "resend_not_configured",
        }),
      }),
    );
  });

  it("returns 402 when team does not have a paid subscription", async () => {
    const countMembers = vi.fn().mockResolvedValue({ count: 1, error: null });
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
              insert: vi.fn(),
            };
          }
          if (table === "subscriptions") {
            return createSubscriptionsTable(false);
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

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", role: "member" }),
      }),
    );

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Inviting teammates requires a paid plan. Visit billing to upgrade first.",
    });
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
          if (table === "subscriptions") {
            return createSubscriptionsTable(true);
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
      isResendCustomEmailConfigured: () => true,
      getResendClientIfConfigured: () => ({ emails: { send: vi.fn() } }),
      getResendFromEmailIfConfigured: () => "SaaS Starter <onboarding@example.com>",
      sendResendEmail: vi.fn(),
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
      ok: false,
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
          if (table === "subscriptions") {
            return createSubscriptionsTable(true);
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
      isResendCustomEmailConfigured: () => true,
      getResendClientIfConfigured: () => ({ emails: { send } }),
      getResendFromEmailIfConfigured: () => "SaaS Starter <onboarding@example.com>",
      sendResendEmail: vi.fn(async () => {
        await send();
      }),
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
          if (table === "subscriptions") {
            return createSubscriptionsTable(true);
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
      isResendCustomEmailConfigured: () => true,
      getResendClientIfConfigured: () => ({ emails: { send: vi.fn() } }),
      getResendFromEmailIfConfigured: () => "SaaS Starter <onboarding@example.com>",
      sendResendEmail: vi.fn(),
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
      ok: false,
      error: "Team member limit reached. Revoke pending invites or remove members first.",
    });
    expect(insert).not.toHaveBeenCalled();
  });
});
