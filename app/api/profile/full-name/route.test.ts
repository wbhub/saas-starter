import { beforeEach, describe, expect, it, vi } from "vitest";

describe("PATCH /api/profile/full-name", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("next/cache", () => ({
      revalidatePath: vi.fn(),
    }));
    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
  });

  it("returns 401 when not authenticated", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: null } }),
        },
      }),
    }));

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/profile/full-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: "Ada Lovelace" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("updates profile full_name", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const from = vi.fn((table: string) => {
      if (table === "profiles") {
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

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/profile/full-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: "Ada Lovelace" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({ full_name: "Ada Lovelace" });
    expect(updateEq).toHaveBeenCalledWith("id", "user_1");
  });
});
