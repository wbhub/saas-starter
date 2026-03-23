import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DELETE /api/team/members/[userId]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
  });

  it("removes member and triggers seat sync", async () => {
    const membershipsMaybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: "22222222-2222-4222-8222-222222222222", role: "member" },
      error: null,
    });
    const membershipDeleteEqUser = vi.fn().mockResolvedValue({ error: null });
    const syncTeamSeatQuantity = vi.fn().mockResolvedValue({
      updated: true,
      previousQuantity: 3,
      seatCount: 2,
    });

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
        role: "owner",
      }),
      invalidateCachedTeamContextForUser: vi.fn(),
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
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn((table: string) => {
          if (table === "team_memberships") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: membershipsMaybeSingle,
              delete: vi.fn(() => ({
                eq: vi.fn().mockReturnValue({
                  eq: membershipDeleteEqUser,
                }),
              })),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/team/members/22222222-2222-4222-8222-222222222222", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({
          userId: "22222222-2222-4222-8222-222222222222",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      seatSynced: true,
    });
    expect(membershipDeleteEqUser).toHaveBeenCalledWith(
      "user_id",
      "22222222-2222-4222-8222-222222222222",
    );
    expect(syncTeamSeatQuantity).toHaveBeenCalledWith("team_123", {
      idempotencyKey:
        "seat-sync:remove-member:team_123:22222222-2222-4222-8222-222222222222:11111111-1111-4111-8111-111111111111",
    });
  });

  it("blocks admins from removing admins", async () => {
    const membershipsMaybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: "22222222-2222-4222-8222-222222222222", role: "admin" },
      error: null,
    });

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
        role: "admin",
      }),
      invalidateCachedTeamContextForUser: vi.fn(),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn((table: string) => {
          if (table === "team_memberships") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: membershipsMaybeSingle,
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));
    vi.doMock("@/lib/stripe/seats", () => ({
      syncTeamSeatQuantity: vi.fn(),
    }));
    vi.doMock("@/lib/stripe/seat-sync-retries", () => ({
      enqueueSeatSyncRetry: vi.fn().mockResolvedValue(undefined),
    }));

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/team/members/22222222-2222-4222-8222-222222222222", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({
          userId: "22222222-2222-4222-8222-222222222222",
        }),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Admins can only remove members.",
    });
  });

  it("returns 200 when member removal succeeds but seat sync fails", async () => {
    const membershipsMaybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: "22222222-2222-4222-8222-222222222222", role: "member" },
      error: null,
    });
    const membershipDeleteEqUser = vi.fn().mockResolvedValue({ error: null });
    const syncTeamSeatQuantity = vi
      .fn()
      .mockRejectedValue(new Error("stripe seat sync failed"));

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
        role: "owner",
      }),
      invalidateCachedTeamContextForUser: vi.fn(),
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
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn((table: string) => {
          if (table === "team_memberships") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: membershipsMaybeSingle,
              delete: vi.fn(() => ({
                eq: vi.fn().mockReturnValue({
                  eq: membershipDeleteEqUser,
                }),
              })),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new Request("http://localhost/api/team/members/22222222-2222-4222-8222-222222222222", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({
          userId: "22222222-2222-4222-8222-222222222222",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      warning: "Member removed, but billing sync failed. Please retry shortly.",
      memberRemoved: true,
    });
  });
});
