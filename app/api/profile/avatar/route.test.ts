import { beforeEach, describe, expect, it, vi } from "vitest";

describe("PATCH /api/profile/avatar", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
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
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: vi.fn(),
    }));

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/profile/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: null }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("updates profile avatar_url", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { avatar_url: null },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) });
    const from = vi.fn((table: string) => {
      if (table === "profiles") {
        return { select, update };
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
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: vi.fn(),
    }));

    const publicUrl =
      "https://project.supabase.co/storage/v1/object/public/profile-photos/user_1/avatar";

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/profile/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: publicUrl }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({ avatar_url: publicUrl });
    expect(updateEq).toHaveBeenCalledWith("id", "user_1");
  });

  it("does not remove storage objects for non-owned previous avatar paths", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        avatar_url:
          "https://project.supabase.co/storage/v1/object/public/profile-photos/other-user/avatar.png",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) });
    const from = vi.fn((table: string) => {
      if (table === "profiles") {
        return { select, update };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: "user_123" } } }),
        },
        from,
      }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: vi.fn(() => ({
        storage: {
          from: vi.fn(() => ({
            remove,
          })),
        },
      })),
    }));

    const newUrl =
      "https://project.supabase.co/storage/v1/object/public/profile-photos/user_123/avatar";

    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("http://localhost/api/profile/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: newUrl }),
      }),
    );

    expect(response.status).toBe(200);
    expect(remove).not.toHaveBeenCalled();
  });
});
