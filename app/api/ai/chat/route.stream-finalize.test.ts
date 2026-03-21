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
    vi.stubEnv("STRIPE_STARTER_PRICE_ID", "price_starter");
    vi.stubEnv("STRIPE_GROWTH_PRICE_ID", "price_growth");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByPriceId: vi.fn().mockReturnValue({ key: "growth" }),
    }));
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("paid"),
      getAiAllowedSubscriptionStatuses: vi
        .fn()
        .mockReturnValue(["trialing", "active", "past_due"]),
      getAiDefaultModel: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiDefaultMonthlyTokenBudget: vi.fn().mockReturnValue(2_000_000),
      getAiRuleForPlan: vi.fn().mockReturnValue({
        enabled: true,
        model: "gpt-4.1-mini",
        monthlyBudget: 2_000_000,
      }),
      getAiModelForPlan: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiMonthlyTokenBudgetForPlan: vi.fn().mockReturnValue(2_000_000),
      getAiAllowedModalities: vi.fn().mockReturnValue(["text", "image", "file"]),
      getAiAllowedModalitiesForPlan: vi.fn().mockReturnValue(["text", "image", "file"]),
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
      maybeProcessAiBudgetFinalizeRetries: vi.fn().mockResolvedValue({ ran: false }),
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

  it("uses streamed output estimate when usage metadata is missing", async () => {
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
        error: null,
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByPriceId: vi.fn().mockReturnValue({ key: "growth" }),
    }));
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("paid"),
      getAiAllowedSubscriptionStatuses: vi
        .fn()
        .mockReturnValue(["trialing", "active", "past_due"]),
      getAiDefaultModel: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiDefaultMonthlyTokenBudget: vi.fn().mockReturnValue(2_000_000),
      getAiRuleForPlan: vi.fn().mockReturnValue({
        enabled: true,
        model: "gpt-4.1-mini",
        monthlyBudget: 2_000_000,
      }),
      getAiModelForPlan: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiMonthlyTokenBudgetForPlan: vi.fn().mockReturnValue(2_000_000),
      getAiAllowedModalities: vi.fn().mockReturnValue(["text", "image", "file"]),
      getAiAllowedModalitiesForPlan: vi.fn().mockReturnValue(["text", "image", "file"]),
    }));
    vi.doMock("@/lib/openai/client", () => ({
      isOpenAiConfigured: true,
      openai: {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(
              makeAsyncStream([
                {
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
      enqueueAiBudgetFinalizeRetry: vi.fn().mockResolvedValue(undefined),
      maybeProcessAiBudgetFinalizeRetries: vi.fn().mockResolvedValue({ ran: false }),
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
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "finalize_ai_token_budget_claim",
      expect.objectContaining({
        p_claim_id: "claim_stream",
        p_actual_tokens: 12,
      }),
    );
  });

  it("skips claim/finalize when budget is zero and still writes ai_usage", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
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
    const rpc = vi.fn();
    const insert = vi.fn().mockResolvedValue({ error: null });

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
          insert,
        })),
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("all"),
      getAiAllowedSubscriptionStatuses: vi
        .fn()
        .mockReturnValue(["trialing", "active", "past_due"]),
      getAiDefaultModel: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiDefaultMonthlyTokenBudget: vi.fn().mockReturnValue(0),
      getAiRuleForPlan: vi.fn(),
      getAiModelForPlan: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiMonthlyTokenBudgetForPlan: vi.fn().mockReturnValue(2_000_000),
      getAiAllowedModalities: vi.fn().mockReturnValue(["text", "image", "file"]),
      getAiAllowedModalitiesForPlan: vi.fn().mockReturnValue(["text", "image", "file"]),
    }));
    vi.doMock("@/lib/openai/client", () => ({
      isOpenAiConfigured: true,
      openai: {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(
              makeAsyncStream([
                {
                  usage: { prompt_tokens: 7, completion_tokens: 3 },
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
      enqueueAiBudgetFinalizeRetry: vi.fn().mockResolvedValue(undefined),
      maybeProcessAiBudgetFinalizeRetries: vi.fn().mockResolvedValue({ ran: false }),
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
    expect(rpc).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        team_id: "team_123",
        user_id: "user_123",
        model: "gpt-4.1-mini",
        prompt_tokens: 7,
        completion_tokens: 3,
      }),
    );
  });

  it("passes multimodal attachments natively and accounts for projected attachment tokens", async () => {
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
        error: null,
      });
    const responsesCreate = vi.fn().mockResolvedValue(
      makeAsyncStream([
        {
          type: "response.output_text.delta",
          delta: "hello",
        },
        {
          type: "response.completed",
          response: {
            usage: { input_tokens: 30, output_tokens: 6 },
          },
        },
      ]),
    );

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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByPriceId: vi.fn().mockReturnValue({ key: "growth" }),
    }));
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("paid"),
      getAiAllowedSubscriptionStatuses: vi
        .fn()
        .mockReturnValue(["trialing", "active", "past_due"]),
      getAiDefaultModel: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiDefaultMonthlyTokenBudget: vi.fn().mockReturnValue(2_000_000),
      getAiRuleForPlan: vi.fn().mockReturnValue({
        enabled: true,
        model: "gpt-4.1-mini",
        monthlyBudget: 2_000_000,
      }),
      getAiModelForPlan: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiMonthlyTokenBudgetForPlan: vi.fn().mockReturnValue(2_000_000),
      getAiAllowedModalities: vi.fn().mockReturnValue(["text", "image", "file"]),
      getAiAllowedModalitiesForPlan: vi.fn().mockReturnValue(["text", "image", "file"]),
    }));
    vi.doMock("@/lib/openai/client", () => ({
      isOpenAiConfigured: true,
      openai: {
        chat: {
          completions: {
            create: vi.fn(),
          },
        },
        responses: {
          create: responsesCreate,
        },
      },
    }));
    vi.doMock("@/lib/audit", () => ({
      logAuditEvent: vi.fn(),
    }));
    vi.doMock("@/lib/ai/budget-finalize-retries", () => ({
      enqueueAiBudgetFinalizeRetry: vi.fn().mockResolvedValue(undefined),
      maybeProcessAiBudgetFinalizeRetries: vi.fn().mockResolvedValue({ ran: false }),
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
          messages: [
            {
              role: "user",
              content: "hello",
              attachments: [
                {
                  type: "image",
                  mimeType: "image/png",
                  url: "https://example.com/image.png",
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("hello");
    expect(responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4.1-mini",
        stream: true,
        max_output_tokens: 4096,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "hello" },
              { type: "input_image", image_url: "https://example.com/image.png" },
            ],
          },
        ],
      }),
      expect.any(Object),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "claim_ai_token_budget",
      expect.objectContaining({
        p_projected_tokens: 5306,
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "finalize_ai_token_budget_claim",
      expect.objectContaining({
        p_claim_id: "claim_stream",
        p_actual_tokens: 36,
      }),
    );
  });
});
