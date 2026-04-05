import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeAsyncStream<T>(chunks: T[], onComplete?: () => Promise<void> | void) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
      await onComplete?.();
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
      supportsProviderFileIds: true,
      providerSupportsModalities: vi.fn().mockReturnValue(true),
      isRequestedModelAllowed: vi.fn().mockReturnValue(true),
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

  it("passes inline image data as raw base64 so the SDK does not treat data: URLs as downloads", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ allowed: true, claim_id: "claim_img", month_start: "2026-03-01" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: null,
      });

    const streamTextFn = vi.fn().mockReturnValue({
      fullStream: makeAsyncStream([
        { type: "text-delta", text: "ok" },
        { type: "finish", totalUsage: { inputTokens: 10, outputTokens: 2 } },
      ]),
    });

    vi.doMock("ai", async () => {
      const actual = await vi.importActual<typeof import("ai")>("ai");
      return {
        ...actual,
        streamText: streamTextFn,
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
      supportsProviderFileIds: true,
      providerSupportsModalities: vi.fn().mockReturnValue(true),
      isRequestedModelAllowed: vi.fn().mockReturnValue(true),
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

    const tinyPngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: "describe",
              attachments: [
                {
                  type: "image",
                  mimeType: "image/png",
                  name: "dot.png",
                  data: tinyPngDataUrl,
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("ok");
    expect(streamTextFn).toHaveBeenCalled();
    const streamArgs = streamTextFn.mock.calls[0][0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const userMessage = streamArgs.messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();
    const parts = userMessage?.content as Array<{ type: string; data?: string }>;
    const filePart = parts.find((p) => p.type === "file");
    expect(filePart?.data).toBeDefined();
    expect(filePart?.data?.startsWith("data:")).toBe(false);
    expect(filePart?.data).toBe(tinyPngDataUrl.slice(tinyPngDataUrl.indexOf(",") + 1));
  });

  it("forces a final synthesis response when a tool run ends without prose", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ allowed: true, claim_id: "claim_tools", month_start: "2026-03-01" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: null,
      });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const logAuditEvent = vi.fn();
    const streamTextFn = vi.fn();
    const generateTextFn = vi.fn().mockResolvedValue({
      text: "Fallback summary",
      totalUsage: { inputTokens: 3, outputTokens: 2 },
    });
    const createThread = vi.fn().mockResolvedValue({ id: "thread_123" });
    const saveThreadMessages = vi.fn().mockResolvedValue(undefined);

    vi.doMock("ai", async () => {
      const actual = await vi.importActual<typeof import("ai")>("ai");
      return {
        ...actual,
        streamText: streamTextFn.mockImplementation(
          (options: {
            onStepFinish?: (step: unknown) => Promise<void> | void;
            onFinish?: (event: unknown) => Promise<void> | void;
          }) => {
            const step = {
              stepNumber: 0,
              text: "",
              sources: [{ title: "Example source", url: "https://example.com/ai" }],
              toolCalls: [
                { toolName: "tavilySearch", input: { query: "recent AI coding agents" } },
              ],
              toolResults: [
                {
                  toolName: "tavilySearch",
                  output: {
                    results: [{ title: "Example source", url: "https://example.com/ai" }],
                  },
                },
              ],
              usage: { inputTokens: 12, outputTokens: 6 },
            };

            return {
              toUIMessageStream: vi.fn().mockImplementation(() =>
                makeAsyncStream(
                  [
                    { type: "start" },
                    { type: "start-step" },
                    {
                      type: "tool-input-available",
                      toolCallId: "call_1",
                      toolName: "tavilySearch",
                      input: { query: "recent AI coding agents" },
                    },
                    {
                      type: "tool-output-available",
                      toolCallId: "call_1",
                      output: {
                        results: [{ title: "Example source", url: "https://example.com/ai" }],
                      },
                    },
                    { type: "finish-step" },
                  ],
                  async () => {
                    await options.onStepFinish?.(step);
                    await options.onFinish?.({
                      ...step,
                      finishReason: "length",
                      totalUsage: { inputTokens: 12, outputTokens: 6 },
                      steps: [step],
                    });
                  },
                ),
              ),
            };
          },
        ),
        generateText: generateTextFn,
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
    vi.doMock("@/lib/ai/tools", () => ({
      AI_TOOL_MAP: {
        tavilySearch: { description: "Search the web." },
      },
      buildAiToolMapForUser: vi.fn().mockResolvedValue({
        tavilySearch: { description: "Search the web." },
      }),
    }));
    vi.doMock("@/lib/ai/threads", () => ({
      createThread,
      saveThreadMessages,
      getThread: vi.fn(),
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
      supportsProviderFileIds: true,
      providerSupportsModalities: vi.fn().mockReturnValue(true),
      isRequestedModelAllowed: vi.fn().mockReturnValue(true),
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

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Summarize recent AI coding agents." }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    const responseText = await response.text();
    expect(responseText).toContain("Fallback summary");
    expect(generateTextFn).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("tool-assisted run ended without a prose answer"),
      }),
    );
    expect(streamTextFn).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("always return a clear user-facing answer"),
      }),
    );
    const streamArgs = streamTextFn.mock.calls[0]?.[0] as {
      stopWhen: (args: { steps: unknown[] }) => boolean;
    };
    expect(await streamArgs.stopWhen({ steps: Array.from({ length: 1 }, () => ({})) })).toBe(false);
    expect(await streamArgs.stopWhen({ steps: Array.from({ length: 2 }, () => ({})) })).toBe(true);
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "finalize_ai_token_budget_claim",
      expect.objectContaining({
        p_claim_id: "claim_tools",
        p_actual_tokens: 23,
      }),
    );
    expect(insert).toHaveBeenCalledTimes(1);
    const auditEvent = logAuditEvent.mock.calls.at(-1)?.[0];
    expect(auditEvent.outcome).toBe("success");
    expect(auditEvent.metadata.maxSteps).toBe(2);
    expect(auditEvent.metadata).not.toHaveProperty("effectiveMaxSteps");
    expect(auditEvent.metadata.forcedSynthesisMode).toBe("model");
    expect(saveThreadMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread_123",
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "assistant",
            parts: [{ type: "text", text: "Fallback summary" }],
            metadata: expect.objectContaining({
              promptTokens: 15,
              completionTokens: 8,
              toolCalls: ["tavilySearch"],
            }),
          }),
        ]),
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
    const streamTextFn = vi.fn();
    const generateTextFn = vi.fn();
    const saveThreadMessages = vi.fn();

    vi.doMock("ai", async () => {
      const actual = await vi.importActual<typeof import("ai")>("ai");
      return {
        ...actual,
        consumeStream,
        streamText: streamTextFn.mockImplementation(
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

            return {
              toUIMessageStream: vi.fn().mockImplementation(() => ({
                async *[Symbol.asyncIterator]() {
                  yield { type: "start" };
                  await aborted;
                  yield { type: "abort", reason: "client_disconnected" };
                },
              })),
            };
          },
        ),
        generateText: generateTextFn,
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
    vi.doMock("@/lib/ai/tools", () => ({
      AI_TOOL_MAP: {
        tavilySearch: { description: "Search the web." },
      },
      buildAiToolMapForUser: vi.fn().mockResolvedValue({
        tavilySearch: { description: "Search the web." },
      }),
    }));
    vi.doMock("@/lib/ai/threads", () => ({
      createThread: vi.fn(),
      saveThreadMessages,
      getThread: vi.fn(),
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
      supportsProviderFileIds: true,
      providerSupportsModalities: vi.fn().mockReturnValue(true),
      isRequestedModelAllowed: vi.fn().mockReturnValue(true),
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
    expect(streamTextFn).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("always return a clear user-facing answer"),
      }),
    );
    const streamArgs = streamTextFn.mock.calls[0]?.[0] as {
      stopWhen: (args: { steps: unknown[] }) => boolean;
    };
    expect(await streamArgs.stopWhen({ steps: Array.from({ length: 1 }, () => ({})) })).toBe(false);
    expect(await streamArgs.stopWhen({ steps: Array.from({ length: 2 }, () => ({})) })).toBe(true);
    requestAbortController.abort();
    const responseText = await response.text();
    expect(responseText).toContain('"type":"abort"');
    expect(generateTextFn).not.toHaveBeenCalled();
    expect(consumeStream).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "finalize_ai_token_budget_claim",
      expect.objectContaining({
        p_claim_id: "claim_abort",
        p_actual_tokens: expect.any(Number),
      }),
    );
    expect(insert).toHaveBeenCalledTimes(1);
    expect(saveThreadMessages).not.toHaveBeenCalled();
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
