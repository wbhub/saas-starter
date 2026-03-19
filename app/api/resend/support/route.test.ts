import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/resend/support", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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
      getClientIp: () => "198.51.100.1",
    }));
    vi.doMock("@/lib/resend/server", () => ({
      getResendClient: vi.fn(),
      getResendFromEmail: vi.fn(),
      getResendSupportEmail: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/resend/support", {
        method: "POST",
        body: JSON.stringify({
          subject: "x".repeat(121),
          message: "This is a valid message body with enough length.",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Subject must be 120 characters or less.",
    });
  });
});

