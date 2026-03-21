import { beforeEach, describe, expect, it, vi } from "vitest";

describe("PATCH /api/team/settings", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 403 for members", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: "user_1" } } }),
        },
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme",
        role: "member",
      }),
      invalidateCachedTeamContextForUser: vi.fn(),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/team/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName: "New Team" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only team owners and admins can update organization settings.",
    });
  });

  it("updates team name for owners/admins", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({
      eq: updateEq,
    }));
    const from = vi.fn((table: string) => {
      if (table === "teams") {
        return { update };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: "user_1" } } }),
        },
        from,
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme",
        role: "owner",
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
            const returns = vi.fn().mockResolvedValue({
              data: [{ user_id: "user_1" }],
              error: null,
            });
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn(() => ({
                returns,
              })),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/team/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName: "Renamed Team" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ name: "Renamed Team" });
    expect(updateEq).toHaveBeenCalledWith("id", "team_123");
  });
});
