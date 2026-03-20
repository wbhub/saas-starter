import { beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/stripe/portal", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("enforces application/json content type", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(),
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
    vi.doMock("@/lib/team-context", () => ({
      getTeamContextForUser: vi.fn(),
      canManageTeamBilling: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/portal", { method: "POST" }),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "Content-Type must be application/json.",
    });
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
    vi.doMock("@/lib/team-context", () => ({
      getTeamContextForUser: vi.fn(),
      canManageTeamBilling: vi.fn(),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns billing portal url for a valid owned customer", async () => {
    const createPortalSession = vi
      .fn()
      .mockResolvedValue({ url: "https://billing.stripe.test/session" });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "user@example.com" } },
          }),
        },
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi
            .fn()
            .mockResolvedValue({ data: { stripe_customer_id: "cus_123" }, error: null }),
        })),
      }),
    }));
    vi.doMock("@/lib/stripe/server", () => ({
      stripe: {
        customers: {
          retrieve: vi
            .fn()
            .mockResolvedValue({ id: "cus_123", metadata: { supabase_team_id: "team_123" } }),
        },
        billingPortal: { sessions: { create: createPortalSession } },
      },
    }));
    vi.doMock("@/lib/env", () => ({
      env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
    vi.doMock("@/lib/team-context", () => ({
      getTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
      canManageTeamBilling: vi.fn().mockReturnValue(true),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://billing.stripe.test/session",
    });
    expect(createPortalSession).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "http://localhost:3000/dashboard",
    });
  });
});
