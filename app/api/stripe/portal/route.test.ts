import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/stripe/portal", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when user is unauthenticated", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: null },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: { retrieve: vi.fn() },
        billingPortal: { sessions: { create: vi.fn() } },
      },
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});
