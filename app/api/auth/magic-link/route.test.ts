import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/auth/magic-link", () => {
  function mockEnvModule() {
    return {
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
      isDevelopmentEnvironment: () => process.env.NODE_ENV === "development",
    };
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
  });

  function makeRequest(body: object) {
    return new Request("http://localhost/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 403 when magic links are disabled", async () => {
    vi.doMock("@/lib/auth/social-auth", () => ({
      getLoginMethod: () => "password",
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientRateLimitIdentifier: () => ({ keyType: "ip", value: "198.51.100.1" }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: vi.fn(),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendCustomEmailConfigured: () => true,
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));
    vi.doMock("@/lib/env", mockEnvModule);

    const { POST } = await import("./route");
    const response = await POST(
      makeRequest({ email: "test@example.com", redirectTo: "/dashboard" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Magic link authentication is not enabled.",
    });
  });

  it("logs a direct callback link in development when Resend is not configured", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const checkRateLimit = vi
      .fn()
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 });
    const generateLink = vi.fn().mockResolvedValue({
      data: { properties: { hashed_token: "hashed_abc123" } },
      error: null,
    });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});

    vi.doMock("@/lib/auth/social-auth", () => ({
      getLoginMethod: () => "magic-link",
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit,
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientRateLimitIdentifier: () => ({ keyType: "ip", value: "198.51.100.1" }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        auth: {
          admin: {
            generateLink,
          },
        },
      }),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendCustomEmailConfigured: () => false,
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));
    vi.doMock("@/lib/env", mockEnvModule);

    const { POST } = await import("./route");
    const response = await POST(
      makeRequest({ email: "test@example.com", redirectTo: "/dashboard" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      message: "If an account exists for that email, a sign-in link has been sent.",
    });
    expect(checkRateLimit).toHaveBeenCalledTimes(2);
    expect(generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "test@example.com",
      options: {
        redirectTo: "http://localhost:3000/auth/callback?next=%2Fdashboard",
      },
    });
    expect(consoleInfo).toHaveBeenCalledWith(
      "Magic link: local link for test@example.com: http://localhost:3000/auth/callback?next=%2Fdashboard&token_hash=hashed_abc123&type=magiclink",
    );

    consoleInfo.mockRestore();
  });
});
