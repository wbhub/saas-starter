import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/team/options", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: null } }),
        },
      }),
    }));
    vi.doMock("@/lib/dashboard/server", () => ({
      getDashboardTeamOptions: vi.fn(),
    }));

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/team/options"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unauthorized",
    });
  });

  it("returns mapped team options for the authenticated user", async () => {
    const getDashboardTeamOptions = vi.fn().mockResolvedValue([
      { teamId: "team_1", teamName: "Alpha", role: "owner" },
      { teamId: "team_2", teamName: "Beta", role: "member" },
    ]);
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: "user_1" } } }),
      },
    };

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => supabase,
    }));
    vi.doMock("@/lib/dashboard/server", () => ({
      getDashboardTeamOptions,
    }));

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/team/options"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      teams: [
        { teamId: "team_1", teamName: "Alpha", role: "owner" },
        { teamId: "team_2", teamName: "Beta", role: "member" },
      ],
    });
    expect(getDashboardTeamOptions).toHaveBeenCalledWith(supabase, "user_1");
  });
});
