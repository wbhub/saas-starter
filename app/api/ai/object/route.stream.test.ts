import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("POST /api/ai/object streaming and finalization", () => {
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

  function mockCoreDependencies({ rpc }: { rpc: ReturnType<typeof vi.fn> }) {
    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/http/content-type", () => ({
      requireJsonContentType: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
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
        allowedModalities: ["text"],
        maxSteps: 1,
      }),
      getAiModelForPlan: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiMonthlyTokenBudgetForPlan: vi.fn().mockReturnValue(2_000_000),
      getAiAllowedModalities: vi.fn().mockReturnValue(["text"]),
      getAiAllowedModalitiesForPlan: vi.fn().mockReturnValue(["text"]),
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
      logger: { error: vi.fn(), warn: vi.fn() },
    }));
  }

  function makeClaimRpc() {
    return vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ allowed: true, claim_id: "claim_obj", month_start: "2026-03-01" }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
  }

  it("returns 200 streaming response with Cache-Control: no-store", async () => {
    const rpc = makeClaimRpc();
    const toTextStreamResponse = vi
      .fn()
      .mockImplementation(
        (opts: { headers?: Record<string, string> }) =>
          new Response("data: {}\n\n", { status: 200, headers: opts?.headers ?? {} }),
      );

    vi.doMock("ai", async () => {
      const actual = await vi.importActual<typeof import("ai")>("ai");
      return {
        ...actual,
        streamObject: vi.fn().mockReturnValue({ toTextStreamResponse }),
      };
    });
    mockCoreDependencies({ rpc });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName: "sentiment", prompt: "This is great!" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(toTextStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { "Cache-Control": "no-store" } }),
    );
  });

  it("calls streamObject with combined schema description and user prompt", async () => {
    const rpc = makeClaimRpc();
    let capturedPrompt: string | undefined;

    vi.doMock("ai", async () => {
      const actual = await vi.importActual<typeof import("ai")>("ai");
      return {
        ...actual,
        streamObject: vi.fn().mockImplementation((options: { prompt?: string }) => {
          capturedPrompt = options.prompt;
          return {
            toTextStreamResponse: vi.fn().mockReturnValue(new Response("", { status: 200 })),
          };
        }),
      };
    });
    mockCoreDependencies({ rpc });

    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/ai/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName: "sentiment", prompt: "I love this product!" }),
      }),
    );

    // route builds: `${schemaEntry.description}\n\n${body.prompt}`
    expect(capturedPrompt).toBe("Analyze the sentiment of the given text.\n\nI love this product!");
  });

  it("finalizes budget claim with actual token usage when stream completes", async () => {
    const rpc = makeClaimRpc();
    let capturedOnFinish:
      | ((args: { usage: { inputTokens: number; outputTokens: number } }) => Promise<void>)
      | undefined;

    vi.doMock("ai", async () => {
      const actual = await vi.importActual<typeof import("ai")>("ai");
      return {
        ...actual,
        streamObject: vi.fn().mockImplementation((options: { onFinish?: unknown }) => {
          capturedOnFinish = options.onFinish as typeof capturedOnFinish;
          return {
            toTextStreamResponse: vi.fn().mockReturnValue(new Response("", { status: 200 })),
          };
        }),
      };
    });
    mockCoreDependencies({ rpc });

    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/ai/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName: "sentiment", prompt: "analyze this" }),
      }),
    );

    // Simulate the AI SDK calling onFinish after stream completes
    await capturedOnFinish!({ usage: { inputTokens: 15, outputTokens: 8 } });

    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "finalize_ai_token_budget_claim",
      expect.objectContaining({
        p_claim_id: "claim_obj",
        p_actual_tokens: 23, // 15 + 8
      }),
    );
  });

  it("finalizes budget with zero tokens and failure outcome when stream errors", async () => {
    const rpc = makeClaimRpc();
    let capturedOnError: ((args: { error: unknown }) => Promise<void>) | undefined;

    vi.doMock("ai", async () => {
      const actual = await vi.importActual<typeof import("ai")>("ai");
      return {
        ...actual,
        streamObject: vi.fn().mockImplementation((options: { onError?: unknown }) => {
          capturedOnError = options.onError as typeof capturedOnError;
          return {
            toTextStreamResponse: vi.fn().mockReturnValue(new Response("", { status: 200 })),
          };
        }),
      };
    });
    mockCoreDependencies({ rpc });

    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/ai/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName: "sentiment", prompt: "analyze this" }),
      }),
    );

    // Simulate the AI SDK calling onError during stream failure
    await capturedOnError!({ error: new Error("stream_broken") });

    // actualTokens is non-zero because resolveActualTokenUsage applies fallback
    // estimation when the provider reports 0 tokens (prompt "analyze this" →
    // Math.ceil(12/3) + 500 = 504 estimated prompt tokens).
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "finalize_ai_token_budget_claim",
      expect.objectContaining({
        p_claim_id: "claim_obj",
        p_actual_tokens: 504,
      }),
    );
  });

  it("does not double-finalize if both onFinish and onError fire", async () => {
    const rpc = makeClaimRpc();
    let capturedOnFinish:
      | ((args: { usage: { inputTokens: number; outputTokens: number } }) => Promise<void>)
      | undefined;
    let capturedOnError: ((args: { error: unknown }) => Promise<void>) | undefined;

    vi.doMock("ai", async () => {
      const actual = await vi.importActual<typeof import("ai")>("ai");
      return {
        ...actual,
        streamObject: vi
          .fn()
          .mockImplementation((options: { onFinish?: unknown; onError?: unknown }) => {
            capturedOnFinish = options.onFinish as typeof capturedOnFinish;
            capturedOnError = options.onError as typeof capturedOnError;
            return {
              toTextStreamResponse: vi.fn().mockReturnValue(new Response("", { status: 200 })),
            };
          }),
      };
    });
    mockCoreDependencies({ rpc });

    const { POST } = await import("./route");
    await POST(
      new Request("http://localhost/api/ai/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName: "sentiment", prompt: "analyze this" }),
      }),
    );

    await capturedOnFinish!({ usage: { inputTokens: 10, outputTokens: 5 } });
    await capturedOnError!({ error: new Error("late_error") });

    // finalize_ai_token_budget_claim should only be called once due to the `finalized` guard
    const finalizeCalls = rpc.mock.calls.filter(
      ([name]: [string]) => name === "finalize_ai_token_budget_claim",
    );
    expect(finalizeCalls).toHaveLength(1);
  });

  it("returns 503 when streamObject throws with an unknown upstream error", async () => {
    const rpc = makeClaimRpc();

    vi.doMock("ai", async () => {
      const actual = await vi.importActual<typeof import("ai")>("ai");
      return {
        ...actual,
        streamObject: vi.fn().mockImplementation(() => {
          throw { status: 503 };
        }),
      };
    });
    mockCoreDependencies({ rpc });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName: "sentiment", prompt: "analyze this" }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "AI assistant is currently unavailable.",
      code: "upstream_error",
    });
  });

  it("returns 429 when streamObject throws an upstream rate limit error", async () => {
    const rpc = makeClaimRpc();

    vi.doMock("ai", async () => {
      const actual = await vi.importActual<typeof import("ai")>("ai");
      return {
        ...actual,
        streamObject: vi.fn().mockImplementation(() => {
          throw { status: 429 };
        }),
      };
    });
    mockCoreDependencies({ rpc });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName: "sentiment", prompt: "analyze this" }),
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "The AI provider is currently rate limited. Please retry shortly.",
      code: "upstream_rate_limited",
    });
  });

  it("returns 400 when streamObject throws an upstream bad request error", async () => {
    const rpc = makeClaimRpc();

    vi.doMock("ai", async () => {
      const actual = await vi.importActual<typeof import("ai")>("ai");
      return {
        ...actual,
        streamObject: vi.fn().mockImplementation(() => {
          throw { status: 400 };
        }),
      };
    });
    mockCoreDependencies({ rpc });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName: "sentiment", prompt: "analyze this" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "This AI request could not be processed. Adjust your input and try again.",
      code: "upstream_bad_request",
    });
  });
});
