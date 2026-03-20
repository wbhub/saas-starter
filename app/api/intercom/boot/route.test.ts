import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/intercom/boot", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns null user when not authenticated", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: null } }) },
      }),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { INTERCOM_IDENTITY_SECRET: "secret" },
    }));

    const { GET } = await import("./route");
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ user: null });
  });

  it("returns null user when identity secret is not configured", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: { id: "u1", email: "a@b.com", created_at: "2026-01-01T00:00:00Z", user_metadata: {} },
            },
          }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { full_name: null } }),
            }),
          }),
        }),
      }),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { INTERCOM_IDENTITY_SECRET: undefined },
    }));

    const { GET } = await import("./route");
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ user: null });
  });

  it("returns signed user payload when authenticated", async () => {
    const signIntercomUserId = vi.fn().mockReturnValue("hmac_hash");

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: {
                id: "user_1",
                email: "member@example.com",
                created_at: "2026-01-01T00:00:00Z",
                user_metadata: { full_name: "Test User" },
              },
            },
          }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { full_name: null } }),
            }),
          }),
        }),
      }),
    }));
    vi.doMock("@/lib/intercom/signature", () => ({ signIntercomUserId }));
    vi.doMock("@/lib/env", () => ({
      env: { INTERCOM_IDENTITY_SECRET: "secret123" },
    }));

    const { GET } = await import("./route");
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: {
        id: "user_1",
        email: "member@example.com",
        name: "Test User",
        createdAt: "2026-01-01T00:00:00Z",
        userHash: "hmac_hash",
      },
    });
    expect(signIntercomUserId).toHaveBeenCalledWith("user_1", "secret123");
  });
});
