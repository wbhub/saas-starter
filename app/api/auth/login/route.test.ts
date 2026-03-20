import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function mockDeps(overrides: {
    signInWithPassword?: ReturnType<typeof vi.fn>;
    checkRateLimit?: ReturnType<typeof vi.fn>;
  } = {}) {
    const signInWithPassword =
      overrides.signInWithPassword ?? vi.fn().mockResolvedValue({ error: null });
    const checkRateLimit =
      overrides.checkRateLimit ??
      vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });

    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: () => null,
    }));
    vi.doMock("@/lib/http/content-type", () => ({
      requireJsonContentType: () => null,
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientRateLimitIdentifier: () => ({ keyType: "ip", value: "198.51.100.1" }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({ checkRateLimit }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({ auth: { signInWithPassword } }),
    }));

    return { signInWithPassword, checkRateLimit };
  }

  function makeRequest(body: object) {
    return new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 200 with valid credentials", async () => {
    const { signInWithPassword } = mockDeps();
    const { POST } = await import("./route");

    const res = await POST(makeRequest({ email: "user@example.com", password: "Passw0rd!" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "Passw0rd!",
    });
  });

  it("returns 401 when supabase rejects credentials", async () => {
    const { signInWithPassword } = mockDeps({
      signInWithPassword: vi.fn().mockResolvedValue({ error: { message: "bad" } }),
    });
    const { POST } = await import("./route");

    const res = await POST(makeRequest({ email: "user@example.com", password: "Passw0rd!" }));

    expect(res.status).toBe(401);
    expect(signInWithPassword).toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    mockDeps({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 30 }),
    });
    const { POST } = await import("./route");

    const res = await POST(makeRequest({ email: "user@example.com", password: "Passw0rd!" }));

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: "Too many login attempts. Please try again later.",
    });
  });
});
