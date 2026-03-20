import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeAsyncStream(chunks: Array<Record<string, unknown>>) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

describe("POST /api/ai/chat stream finalization retry enqueue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enqueues retry when stream-finally budget finalization fails", async () => {
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
        data: [{ allowed: true, claim_id: "claim_stream", month_start: "2026-03-01" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "finalize failed" },
      });
    const enqueueAiBudgetFinalizeRetry = vi.fn().mockResolvedValue(undefined);

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
    vi.doMock("@/lib/ai/config", () => ({
      getAiAllowedSubscriptionStatuses: vi
        .fn()
        .mockReturnValue(["trialing", "active", "past_due"]),
      getAiModelForPlan: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiMonthlyTokenBudgetForPlan: vi.fn().mockReturnValue(2_000_000),
    }));
    vi.doMock("@/lib/openai/client", () => ({
      isOpenAiConfigured: true,
      openai: {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(
              makeAsyncStream([
                {
                  usage: { prompt_tokens: 10, completion_tokens: 5 },
                  choices: [{ delta: { content: "hello" } }],
                },
              ]),
            ),
          },
        },
      },
    }));
    vi.doMock("@/lib/audit", () => ({
      logAuditEvent: vi.fn(),
    }));
    vi.doMock("@/lib/ai/budget-finalize-retries", () => ({
      enqueueAiBudgetFinalizeRetry,
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        error: vi.fn(),
        warn: vi.fn(),
      },
    }));

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

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("hello");
    expect(enqueueAiBudgetFinalizeRetry).toHaveBeenCalledWith({
      claimId: "claim_stream",
      actualTokens: 15,
      error: expect.objectContaining({ message: "finalize failed" }),
    });
  });
});
