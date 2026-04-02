import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    /** Run scheduled work on a microtask so Vitest can flush it without request AsyncLocalStorage. */
    after: (task: Parameters<typeof actual.after>[0]) => {
      void Promise.resolve(typeof task === "function" ? (task as () => unknown)() : task);
    },
  };
});

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_AUTH_LOGIN_METHOD", "password");
    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
  });

  it("returns a generic success payload when rate limited", async () => {
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: async () => ({ allowed: false, retryAfterSeconds: 60 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientRateLimitIdentifier: () => ({ keyType: "ip", value: "198.51.100.1" }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: vi.fn(),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendCustomEmailConfigured: () => true,
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "If an account exists for that email, a reset link has been sent.",
    });
  });

  it("returns 403 when password reset is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_LOGIN_METHOD", "magic-link");
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientRateLimitIdentifier: () => ({ keyType: "ip", value: "198.51.100.1" }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: vi.fn(),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendCustomEmailConfigured: () => true,
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Password reset is not enabled.",
    });
  });

  it("uses a bounded fallback IP limiter key when client IP is unavailable", async () => {
    const checkRateLimit = vi
      .fn()
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 });
    const generateLink = vi.fn().mockResolvedValue({
      data: { properties: { hashed_token: "hashed_abc123" } },
      error: null,
    });
    const send = vi.fn().mockResolvedValue({});

    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit,
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientRateLimitIdentifier: () => ({
        keyType: "fingerprint",
        value: "unknown:unknown:unknown:unknown",
      }),
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
    vi.doMock("@/lib/resend/server", () => ({
      isResendCustomEmailConfigured: () => true,
      getResendClientIfConfigured: () => ({ emails: { send } }),
      getResendFromEmailIfConfigured: () => "noreply@example.com",
      sendResendEmail: vi.fn(async () => {
        await send();
      }),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledTimes(2);
    expect(checkRateLimit).toHaveBeenNthCalledWith(1, {
      key: "forgot-password:fingerprint:unknown:unknown:unknown:unknown",
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    expect(checkRateLimit).toHaveBeenNthCalledWith(2, {
      key: "forgot-password:email:test@example.com",
      limit: 3,
      windowMs: 10 * 60 * 1000,
    });
    await vi.waitFor(() => {
      expect(generateLink).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  it("returns generic success for non-outage generateLink errors", async () => {
    const checkRateLimit = vi
      .fn()
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 });
    const generateLink = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "supabase down" },
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

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
    vi.doMock("@/lib/resend/server", () => ({
      isResendCustomEmailConfigured: () => true,
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "If an account exists for that email, a reset link has been sent.",
    });
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to generate password reset link",
        expect.objectContaining({ message: "supabase down" }),
      );
    });

    consoleError.mockRestore();
  });

  it("returns generic success when generateLink fails with provider outage (logged in background)", async () => {
    const checkRateLimit = vi
      .fn()
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 });
    const generateLink = vi.fn().mockResolvedValue({
      data: null,
      error: { status: 503, message: "service unavailable" },
    });

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
    vi.doMock("@/lib/resend/server", () => ({
      isResendCustomEmailConfigured: () => true,
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "If an account exists for that email, a reset link has been sent.",
    });
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "Forgot-password: recovery link failed (provider outage)",
        expect.objectContaining({ status: 503, message: "service unavailable" }),
      );
    });

    consoleError.mockRestore();
  });

  it("falls back to Supabase-managed reset email when Resend is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const checkRateLimit = vi
      .fn()
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 });
    const generateLink = vi.fn();
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });

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
          resetPasswordForEmail,
        },
      }),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendCustomEmailConfigured: () => false,
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "If an account exists for that email, a reset link has been sent.",
    });
    await vi.waitFor(() => {
      expect(resetPasswordForEmail).toHaveBeenCalledWith("test@example.com", {
        redirectTo: "http://localhost:3000/auth/callback?next=/reset-password",
      });
      expect(generateLink).not.toHaveBeenCalled();
    });
  });

  it("logs a local reset link in development when Resend is not configured", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const checkRateLimit = vi
      .fn()
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 });
    const generateLink = vi.fn().mockResolvedValue({
      data: { properties: { hashed_token: "hashed_abc123" } },
      error: null,
    });
    const resetPasswordForEmail = vi.fn();
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});

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
          resetPasswordForEmail,
        },
      }),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendCustomEmailConfigured: () => false,
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "If an account exists for that email, a reset link has been sent.",
    });
    expect(generateLink).toHaveBeenCalledWith({
      type: "recovery",
      email: "test@example.com",
      options: {
        redirectTo: "http://localhost:3000/auth/callback?next=/reset-password",
      },
    });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(consoleInfo).toHaveBeenCalledWith(
      "Forgot-password: local reset link for test@example.com: http://localhost:3000/auth/callback?next=%2Freset-password&token_hash=hashed_abc123&type=recovery",
    );

    consoleInfo.mockRestore();
  });
});
