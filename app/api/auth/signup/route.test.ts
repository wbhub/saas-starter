import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_AUTH_LOGIN_METHOD", "password");
  });

  function mockDeps(
    overrides: {
      signUp?: ReturnType<typeof vi.fn>;
    } = {},
  ) {
    const signUp =
      overrides.signUp ?? vi.fn().mockResolvedValue({ data: { session: null }, error: null });

    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: () => null,
      rotateCsrfTokenOnResponse: (response: Response) => response,
    }));
    vi.doMock("@/lib/http/content-type", () => ({
      requireJsonContentType: () => null,
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientRateLimitIdentifier: () => ({ keyType: "ip", value: "198.51.100.1" }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/validation", () => ({
      isValidEmail: () => true,
      validatePasswordComplexity: () => ({ valid: true }),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({ auth: { signUp } }),
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
      getAppUrl: () => "http://localhost:3000",
    }));

    return { signUp };
  }

  function makeRequest(body: object) {
    return new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("creates an account and returns confirmation message", async () => {
    const { signUp } = mockDeps();
    const { POST } = await import("./route");

    const res = await POST(
      makeRequest({ email: "new@example.com", password: "correct horse battery staple" }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      sessionCreated: false,
      message: "Account created. Check your inbox to verify email if confirmation is enabled.",
    });
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        password: "correct horse battery staple",
      }),
    );
  });

  it("returns 403 when password signup is disabled", async () => {
    const { signUp } = mockDeps();
    vi.stubEnv("NEXT_PUBLIC_AUTH_LOGIN_METHOD", "magic-link");
    const { POST } = await import("./route");

    const res = await POST(
      makeRequest({ email: "new@example.com", password: "correct horse battery staple" }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "Password signup is not enabled.",
    });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("returns 400 when supabase rejects signup", async () => {
    mockDeps({
      signUp: vi.fn().mockResolvedValue({ data: {}, error: { message: "exists" } }),
    });
    const { POST } = await import("./route");

    const res = await POST(
      makeRequest({ email: "dup@example.com", password: "correct horse battery staple" }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "Unable to create your account.",
    });
  });
});
