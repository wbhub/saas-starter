import { beforeEach, describe, expect, it, vi } from "vitest";

describe("dashboard actions hardening", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";

    vi.doMock("next/cache", () => ({
      revalidatePath: vi.fn(),
    }));
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn(),
    }));
    vi.doMock("next/headers", () => ({
      headers: async () => new Headers(),
      cookies: async () => ({
        set: vi.fn(),
        get: vi.fn(),
      }),
    }));
    vi.doMock("@/lib/security/csrf", () => ({
      CSRF_CLIENT_COOKIE_NAME: "csrf_token_client",
      CSRF_COOKIE_NAME: "csrf_token",
      createCsrfToken: vi.fn(() => "csrf-token"),
      getClientReadableCsrfCookieOptions: vi.fn(() => ({})),
      getServerActionCsrfCookieOptions: vi.fn(() => ({})),
      verifyCsrfProtectionForServerAction: vi.fn(() => null),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      invalidateCachedTeamContextForUser: vi.fn(),
    }));
    vi.doMock("@/lib/stripe/seats", () => ({
      syncTeamSeatQuantity: vi.fn(),
    }));
    vi.doMock("@/lib/stripe/seat-sync-retries", () => ({
      enqueueSeatSyncRetry: vi.fn(),
    }));
  });

  it("rate limits email change requests before calling Supabase", async () => {
    const updateUser = vi.fn();
    const checkRateLimit = vi.fn().mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 42,
    });

    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit,
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: {
                id: "user_123",
                email: "current@example.com",
              },
            },
          }),
          updateUser,
        },
      }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: vi.fn(),
    }));

    const { requestEmailChange } = await import("./actions");
    const formData = new FormData();
    formData.set("newEmail", "next@example.com");

    await expect(
      requestEmailChange({ status: "idle", message: null }, formData),
    ).resolves.toEqual({
      status: "error",
      message: "Too many email change requests. Please wait 42 seconds and try again.",
    });
    expect(checkRateLimit).toHaveBeenCalledWith({
      key: "email-change:user:user_123",
      limit: 5,
      windowMs: 600000,
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("skips deleting previous avatar files outside the current user's folder", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const profilesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          avatar_url:
            "https://project.supabase.co/storage/v1/object/public/profile-photos/other-user/avatar.png",
        },
        error: null,
      }),
      update: vi.fn().mockReturnValue({
        eq: updateEq,
      }),
    };

    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: {
                id: "user_123",
                email: "current@example.com",
              },
            },
          }),
        },
        from: vi.fn((table: string) => {
          if (table !== "profiles") {
            throw new Error(`Unexpected table: ${table}`);
          }
          return profilesQuery;
        }),
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

    const { updateDashboardSettings } = await import("./actions");
    const formData = new FormData();
    formData.set("fullName", "Updated User");

    await expect(
      updateDashboardSettings({ status: "idle", message: null }, formData),
    ).resolves.toEqual({
      status: "success",
      message: "Settings saved.",
    });
    expect(remove).not.toHaveBeenCalled();
  });
});
