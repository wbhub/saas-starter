import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeAsyncStream<T>(chunks: T[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

describe("POST /api/ai/chat AI SDK streaming", () => {
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

  it("streams text deltas and finalizes budget from finish usage", async () => {
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

    vi.doMock("ai", async () => {
      const actual = await vi.importActual<typeof import("ai")>("ai");
      return {
        ...actual,
        streamText: vi.fn().mockReturnValue({
          fullStream: makeAsyncStream([
            { type: "text-delta", text: "hello" },
            { type: "finish", totalUsage: { inputTokens: 9, outputTokens: 4 } },
          ]),
        }),
      };
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
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { stripe_price_id: "price_growth", status: "active" },
            error: null,
          }),
        })),
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
      getAiToolsEnabled: vi.fn().mockReturnValue(false),
      getAiMaxSteps: vi.fn().mockReturnValue(1),
      getAiAllowedSubscriptionStatuses: vi.fn().mockReturnValue(["trialing", "active", "past_due"]),
      getAiDefaultModel: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiDefaultMonthlyTokenBudget: vi.fn().mockReturnValue(2_000_000),
      getAiRuleForPlan: vi.fn().mockReturnValue({
        enabled: true,
        model: "gpt-4.1-mini",
        monthlyBudget: 2_000_000,
        allowedModalities: ["text", "image", "file"],
        maxSteps: 1,
      }),
      getAiModelForPlan: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiMonthlyTokenBudgetForPlan: vi.fn().mockReturnValue(2_000_000),
      getAiAllowedModalities: vi.fn().mockReturnValue(["text", "image", "file"]),
      getAiAllowedModalitiesForPlan: vi.fn().mockReturnValue(["text", "image", "file"]),
    }));
    vi.doMock("@/lib/ai/provider", () => ({
      aiProviderName: "openai",
      isAiProviderConfigured: true,
      supportsOpenAiFileIds: true,
      providerSupportsModalities: vi.fn().mockReturnValue(true),
      getAiLanguageModel: vi.fn().mockReturnValue("provider-model"),
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
        p_actual_tokens: 13,
      }),
    );
  });

  it("finalizes agent budget and audit on tool-stream abort", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ allowed: true, claim_id: "claim_abort", month_start: "2026-03-01" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: null,
      });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const logAuditEvent = vi.fn();
    const consumeStream = vi.fn();
    const toUIMessageStreamResponse = vi.fn();

    vi.doMock("ai", async () => {
      const actual = await vi.importActual<typeof import("ai")>("ai");
      return {
        ...actual,
        consumeStream,
        streamText: vi
          .fn()
          .mockImplementation(
            (options: { abortSignal?: AbortSignal; onAbort?: () => Promise<void> | void }) => {
              const aborted = new Promise<void>((resolve) => {
                options.abortSignal?.addEventListener(
                  "abort",
                  () => {
                    void (async () => {
                      await options.onAbort?.();
                      resolve();
                    })();
                  },
                  { once: true },
                );
              });

              toUIMessageStreamResponse.mockImplementation(
                (responseOptions?: { consumeSseStream?: unknown }) =>
                  new Response(
                    new ReadableStream({
                      async start(controller) {
                        await aborted;
                        controller.close();
                      },
                    }),
                    {
                      headers:
                        responseOptions?.consumeSseStream === consumeStream
                          ? { "X-Consume-SSE-Stream": "configured" }
                          : undefined,
                    },
                  ),
              );

              return {
                toUIMessageStreamResponse,
              };
            },
          ),
      };
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
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { stripe_price_id: "price_growth", status: "active" },
            error: null,
          }),
        })),
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
    vi.doMock("@/lib/stripe/config", () => ({
      getPlanByPriceId: vi.fn().mockReturnValue({ key: "growth" }),
    }));
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("paid"),
      getAiToolsEnabled: vi.fn().mockReturnValue(true),
      getAiMaxSteps: vi.fn().mockReturnValue(2),
      getAiAllowedSubscriptionStatuses: vi.fn().mockReturnValue(["trialing", "active", "past_due"]),
      getAiDefaultModel: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiDefaultMonthlyTokenBudget: vi.fn().mockReturnValue(2_000_000),
      getAiRuleForPlan: vi.fn().mockReturnValue({
        enabled: true,
        model: "gpt-4.1-mini",
        monthlyBudget: 2_000_000,
        allowedModalities: ["text", "image", "file"],
        maxSteps: 2,
      }),
      getAiModelForPlan: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiMonthlyTokenBudgetForPlan: vi.fn().mockReturnValue(2_000_000),
      getAiAllowedModalities: vi.fn().mockReturnValue(["text", "image", "file"]),
      getAiAllowedModalitiesForPlan: vi.fn().mockReturnValue(["text", "image", "file"]),
    }));
    vi.doMock("@/lib/ai/provider", () => ({
      aiProviderName: "openai",
      isAiProviderConfigured: true,
      supportsOpenAiFileIds: true,
      providerSupportsModalities: vi.fn().mockReturnValue(true),
      getAiLanguageModel: vi.fn().mockReturnValue("provider-model"),
    }));
    vi.doMock("@/lib/audit", () => ({
      logAuditEvent,
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

    const requestAbortController = new AbortController();
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hello" }],
        }),
        signal: requestAbortController.signal,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Consume-SSE-Stream")).toBe("configured");
    requestAbortController.abort();
    await expect(response.text()).resolves.toBe("");
    expect(toUIMessageStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        consumeSseStream: consumeStream,
        headers: { "Cache-Control": "no-store" },
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "finalize_ai_token_budget_claim",
      expect.objectContaining({
        p_claim_id: "claim_abort",
        p_actual_tokens: expect.any(Number),
      }),
    );
    expect(insert).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "failure",
        metadata: expect.objectContaining({
          toolsEnabled: true,
          reason: "client_disconnected",
        }),
      }),
    );
  });
});
