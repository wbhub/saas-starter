import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns a generic success payload when rate limited", async () => {
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: async () => ({ allowed: false, retryAfterSeconds: 60 }),
    }));
    vi.doMock("@/lib/http/client-ip", () => ({
      getClientIp: () => "198.51.100.1",
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
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: "test@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "If an account exists for that email, a reset link has been sent.",
    });
  });
});

