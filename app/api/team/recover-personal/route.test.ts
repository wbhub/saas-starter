import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/team/recover-personal", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("recovers a personal team for authenticated user", async () => {
    const recoverPersonalTeamForUser = vi.fn().mockResolvedValue("team_123");

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: {
                id: "user_123",
                email: "user@example.com",
                user_metadata: { full_name: "Test User" },
              },
            },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/team-recovery", () => ({
      recoverPersonalTeamForUser,
    }));

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/team/recover-personal", { method: "POST" });
    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, teamId: "team_123" });
    expect(recoverPersonalTeamForUser).toHaveBeenCalledWith(
      "user_123",
      "user@example.com",
      "Test User",
    );
  });
});
