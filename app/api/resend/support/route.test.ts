import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/resend/support", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
  });

  it("enforces application/json content type", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn(),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientRateLimitIdentifier: vi.fn(),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendSupportEmailConfigured: vi.fn(),
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      getResendSupportEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/resend/support", { method: "POST" }),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Content-Type must be application/json.",
    });
  });

  it("returns 429 when support endpoint is rate limited", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: { id: "user_123", email: "user@example.com" },
            },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi
        .fn()
        .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 12 })
        .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientRateLimitIdentifier: () => ({ keyType: "ip", value: "198.51.100.1" }),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendSupportEmailConfigured: vi.fn(),
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      getResendSupportEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/resend/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Need help",
          message: "This is a valid support request message.",
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Too many requests. Please try again shortly.",
    });
  });

  it("rejects oversized subject from direct callers", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: { id: "user_123", email: "user@example.com" },
            },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientRateLimitIdentifier: () => ({ keyType: "ip", value: "198.51.100.1" }),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendSupportEmailConfigured: vi.fn(),
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      getResendSupportEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/resend/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "x".repeat(121),
          message: "This is a valid message body with enough length.",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Subject must be 120 characters or less.",
    });
  });

  it("returns 413 when payload exceeds JSON size limit", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: { id: "user_123", email: "user@example.com" },
            },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientRateLimitIdentifier: () => ({ keyType: "ip", value: "198.51.100.1" }),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendSupportEmailConfigured: vi.fn(),
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      getResendSupportEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/resend/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(300 * 1024),
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Request payload is too large.",
    });
  });

  it("returns 503 when support email is disabled because Resend is unconfigured", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: { id: "user_123", email: "user@example.com" },
            },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientRateLimitIdentifier: () => ({ keyType: "ip", value: "198.51.100.1" }),
    }));
    vi.doMock("@/lib/resend/server", () => ({
      isResendSupportEmailConfigured: () => false,
      getResendClientIfConfigured: vi.fn(),
      getResendFromEmailIfConfigured: vi.fn(),
      getResendSupportEmailIfConfigured: vi.fn(),
      sendResendEmail: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/resend/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Need help",
          message: "This is a valid support request message.",
        }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Support email is currently unavailable for this deployment.",
    });
  });
});
