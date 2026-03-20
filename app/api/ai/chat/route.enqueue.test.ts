import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/ai/chat finalize retry enqueue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function mockCoreDependencies({
    enqueueImpl,
  }: {
    enqueueImpl: (args: {
      claimId: string;
      actualTokens: number;
      error: unknown;
    }) => Promise<void>;
  }) {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { stripe_price_id: "price_growth", status: "active" },
      error: null,
    });
    const subscriptionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle,
    };

    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ allowed: true, claim_id: "claim_123", month_start: "2026-03-01" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "finalize failed" },
      });

    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/http/content-type", () => ({
      requireJsonContentType: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "user@example.com" } },
          }),
        },
        from: vi.fn((table: string) => {
          if (table === "subscriptions") {
            return subscriptionsQuery;
          }
          throw new Error(`Unexpected table: ${table}`);
        }),
      }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        rpc,
        from: vi.fn(() => ({
          insert: vi.fn().mockResolvedValue({ error: null }),
        })),
      }),
    }));
    vi.doMock("@/lib/team-context", () => ({
      getTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByPriceId: vi.fn().mockReturnValue({ key: "growth" }),
    }));
    vi.doMock("@/lib/openai/client", () => ({
      isOpenAiConfigured: true,
      openai: {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue({ status: 503 }),
          },
        },
      },
    }));
    vi.doMock("@/lib/audit", () => ({
      logAuditEvent: vi.fn(),
    }));
    vi.doMock("@/lib/ai/budget-finalize-retries", () => ({
      enqueueAiBudgetFinalizeRetry: vi.fn(enqueueImpl),
    }));
    const loggerError = vi.fn();
    vi.doMock("@/lib/logger", () => ({
      logger: {
        error: loggerError,
        warn: vi.fn(),
      },
    }));

    return { rpc, loggerError };
  }

  it("enqueues finalize retry when claim release fails after create failure", async () => {
    const enqueueImpl = vi.fn().mockResolvedValue(undefined);
    mockCoreDependencies({ enqueueImpl });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );

    expect(response.status).toBe(502);
    expect(enqueueImpl).toHaveBeenCalledWith({
      claimId: "claim_123",
      actualTokens: 0,
      error: expect.objectContaining({ message: "finalize failed" }),
    });
  });

  it("continues returning mapped error when enqueueing finalize retry also fails", async () => {
    const enqueueImpl = vi.fn().mockRejectedValue(new Error("queue write failed"));
    const { loggerError } = mockCoreDependencies({ enqueueImpl });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "AI provider is temporarily unavailable. Please try again.",
    });
    expect(loggerError).toHaveBeenCalledWith(
      "Failed to enqueue AI budget finalize retry after create failure",
      expect.any(Error),
      expect.objectContaining({
        teamId: "team_123",
        userId: "user_123",
        claimId: "claim_123",
      }),
    );
  });
});
