import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function makeRequest(url: string, body: Record<string, unknown>, cookieHeader?: string) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /reset-password/submit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/security/csrf", async () => {
      const actual =
        await vi.importActual<typeof import("@/lib/security/csrf")>("@/lib/security/csrf");
      return {
        ...actual,
        verifyCsrfProtection: vi.fn().mockReturnValue(null),
      };
    });
  });

  it("returns 429 when rate limited", async () => {
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: false,
        retryAfterSeconds: 42,
      }),
    }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      makeRequest("http://localhost/reset-password/submit", {
        password: "correct horse battery staple",
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Too many password reset attempts. Please try again later.",
    });
  });

  it("rejects requests without recovery proof cookies", async () => {
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      makeRequest("http://localhost/reset-password/submit", {
        password: "correct horse battery staple",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Reset link is invalid or expired. Please request a new link.",
    });
  });

  it("rejects overlong passwords", async () => {
    const createServerClient = vi.fn();

    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient,
    }));

    const { POST } = await import("./route");
    const response = await POST(
      makeRequest("http://localhost/reset-password/submit", { password: "a".repeat(129) }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Password must be between 12 and 128 characters.",
    });
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("rejects requests when session user differs from recovery user", async () => {
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: "user_b" } } }),
        },
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      makeRequest(
        "http://localhost/reset-password/submit",
        { password: "correct horse battery staple" },
        "auth_password_recovery=1; auth_password_recovery_user=user_a",
      ),
    );

    expect(response.status).toBe(403);
  });

  it("updates password and clears recovery cookies when proof matches session user", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });

    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@supabase/ssr", () => ({
      createServerClient: () => ({
        auth: {
          getUser: async () => ({ data: { user: { id: "user_a" } } }),
          updateUser,
        },
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      makeRequest(
        "http://localhost/reset-password/submit",
        { password: "correct horse battery staple" },
        "auth_password_recovery=1; auth_password_recovery_user=user_a",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(updateUser).toHaveBeenCalledWith({ password: "correct horse battery staple" });
    expect(response.headers.get("set-cookie")).toContain("auth_password_recovery=;");
  });
});
