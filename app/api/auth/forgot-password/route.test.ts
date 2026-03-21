import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    /** Run scheduled work on a microtask so Vitest can flush it without request AsyncLocalStorage. */
    after: (task: Parameters<typeof actual.after>[0]) => {
      void Promise.resolve(
        typeof task === "function" ? (task as () => unknown)() : task,
      );
    },
  };
});

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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
      getResendClient: vi.fn(),
      getResendFromEmail: vi.fn(),
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

  it("uses a bounded fallback IP limiter key when client IP is unavailable", async () => {
    const checkRateLimit = vi
      .fn()
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 });
    const generateLink = vi.fn().mockResolvedValue({
      data: { properties: { action_link: "https://example.com/reset" } },
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
      getResendClient: () => ({ emails: { send } }),
      getResendFromEmail: () => "noreply@example.com",
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
      getResendClient: vi.fn(),
      getResendFromEmail: vi.fn(),
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
      getResendClient: vi.fn(),
      getResendFromEmail: vi.fn(),
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
});

