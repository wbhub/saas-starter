import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";

const aiMockState = vi.hoisted(() => ({
  streamText: vi.fn(),
}));

const providerMockState = vi.hoisted(() => ({
  aiProviderName: "openai" as "openai" | "anthropic" | "google",
  supportsProviderFileIds: true,
  providerSupportsModalities: vi.fn(),
  isRequestedModelAllowed: vi.fn(),
  getAiLanguageModel: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    streamText: aiMockState.streamText,
  };
});

vi.mock("@/lib/ai/provider", () => ({
  get aiProviderName() {
    return providerMockState.aiProviderName;
  },
  isAiProviderConfigured: true,
  isAiProviderConfiguredForModel: vi.fn(() => true),
  getAiProviderForModel: vi.fn(() => providerMockState.aiProviderName),
  get supportsProviderFileIds() {
    return providerMockState.supportsProviderFileIds;
  },
  modelSupportsProviderFileIds: vi.fn(() => providerMockState.supportsProviderFileIds),
  providerSupportsModalities: providerMockState.providerSupportsModalities,
  isRequestedModelAllowed: providerMockState.isRequestedModelAllowed,
  getAiLanguageModel: providerMockState.getAiLanguageModel,
}));

function mockAiUnavailableResponse() {
  aiMockState.streamText.mockReset();
  aiMockState.streamText.mockImplementation(() => {
    throw { status: 503 };
  });
}

function mockAiTextResponse(text: string) {
  aiMockState.streamText.mockReset();
  aiMockState.streamText.mockReturnValue({
    fullStream: {
      async *[Symbol.asyncIterator]() {
        yield { type: "text-delta", text };
        yield { type: "finish", totalUsage: { inputTokens: 7, outputTokens: 2 } };
      },
    },
  });
}

function mockProviderModule({
  aiProviderName = "openai",
  supportsProviderFileIds = aiProviderName === "openai",
}: {
  aiProviderName?: "openai" | "anthropic" | "google";
  supportsProviderFileIds?: boolean;
} = {}) {
  providerMockState.aiProviderName = aiProviderName;
  providerMockState.supportsProviderFileIds = supportsProviderFileIds;
  providerMockState.providerSupportsModalities.mockReset();
  providerMockState.providerSupportsModalities.mockImplementation(
    (model: string) => !model.startsWith("gpt-3.5"),
  );
  providerMockState.isRequestedModelAllowed.mockReset();
  providerMockState.isRequestedModelAllowed.mockReturnValue(true);
  providerMockState.getAiLanguageModel.mockReset();
  providerMockState.getAiLanguageModel.mockReturnValue("provider-model");
}

async function expectLatestStreamTextMessagesToMatchModelSchema() {
  const { modelMessageSchema, streamText } = await import("ai");
  const latestCall = vi.mocked(streamText).mock.calls.at(-1);

  expect(latestCall).toBeDefined();

  const validation = modelMessageSchema.array().safeParse(latestCall?.[0]?.messages);
  expect(
    validation.success,
    validation.success ? undefined : JSON.stringify(validation.error.issues, null, 2),
  ).toBe(true);
}

describe("POST /api/ai/chat access and gating", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STRIPE_STARTER_PRICE_ID", "price_starter");
    vi.stubEnv("STRIPE_GROWTH_PRICE_ID", "price_growth");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");

    vi.doMock("@/lib/security/csrf", () => ({
      verifyCsrfProtection: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/http/content-type", () => ({
      requireJsonContentType: vi.fn().mockReturnValue(null),
    }));
    vi.doMock("@/lib/audit", () => ({
      logAuditEvent: vi.fn(),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        error: vi.fn(),
        warn: vi.fn(),
      },
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
    mockProviderModule();
    mockAiUnavailableResponse();
    vi.doMock("@/lib/ai/budget-finalize-retries", () => ({
      enqueueAiBudgetFinalizeRetry: vi.fn().mockResolvedValue(undefined),
      maybeProcessAiBudgetFinalizeRetries: vi.fn().mockResolvedValue({ ran: false }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        rpc: vi
          .fn()
          .mockResolvedValueOnce({
            data: [{ allowed: true, claim_id: "claim_123", month_start: "2026-03-01" }],
            error: null,
          })
          .mockResolvedValueOnce({
            data: null,
            error: null,
          }),
        from: vi.fn(() => ({
          insert: vi.fn().mockResolvedValue({ error: null }),
        })),
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: null },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn(),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn(),
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

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unauthorized",
    });
  });

  it("returns 429 when user/team rate limit is exceeded", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi
        .fn()
        .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 10 })
        .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 }),
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

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("10");
  });

  it("returns generic unavailable when allowed statuses config is empty", async () => {
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("paid"),
      getAiToolsEnabled: vi.fn().mockReturnValue(false),
      getAiMaxSteps: vi.fn().mockReturnValue(1),
      getAiAllowedSubscriptionStatuses: vi.fn().mockReturnValue([]),
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
    const subscriptionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
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

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "AI access requires an eligible paid plan.",
      code: "plan_required",
    });
    const { streamText } = await import("ai");
    expect(streamText).not.toHaveBeenCalled();
  });

  it("keeps default paid mode behavior and denies free users", async () => {
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
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
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

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "AI access requires an eligible paid plan.",
      code: "plan_required",
    });
    const { streamText } = await import("ai");
    expect(streamText).not.toHaveBeenCalled();
  });

  it("allows free users in all mode", async () => {
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("all"),
      getAiToolsEnabled: vi.fn().mockReturnValue(false),
      getAiMaxSteps: vi.fn().mockReturnValue(1),
      getAiAllowedSubscriptionStatuses: vi.fn().mockReturnValue(["trialing", "active", "past_due"]),
      getAiDefaultModel: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiDefaultMonthlyTokenBudget: vi.fn().mockReturnValue(0),
      getAiRuleForPlan: vi.fn(),
      getAiModelForPlan: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiMonthlyTokenBudgetForPlan: vi.fn().mockReturnValue(2_000_000),
      getAiAllowedModalities: vi.fn().mockReturnValue(["text", "image", "file"]),
      getAiAllowedModalitiesForPlan: vi.fn().mockReturnValue(["text", "image", "file"]),
    }));
    const subscriptionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { stripe_price_id: "price_growth", status: "active" },
        error: null,
      }),
    };
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
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

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "AI assistant is currently unavailable.",
      code: "upstream_error",
    });
    const { streamText } = await import("ai");
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it("fails safely in by_plan mode when model is missing", async () => {
    const aiConfig = await import("@/lib/ai/config");
    vi.mocked(aiConfig.getAiAccessMode).mockReturnValue("by_plan");
    vi.mocked(aiConfig.getAiRuleForPlan).mockReturnValue({
      enabled: true,
      model: null,
      monthlyBudget: 10_000,
      allowedModalities: ["text", "image", "file"],
      maxSteps: 1,
    });
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
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
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

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "AI access requires an eligible paid plan.",
      code: "plan_required",
    });
    const { streamText } = await import("ai");
    expect(streamText).not.toHaveBeenCalled();
  });

  it("filters by_plan subscription lookup to live statuses", async () => {
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("by_plan"),
      getAiToolsEnabled: vi.fn().mockReturnValue(false),
      getAiMaxSteps: vi.fn().mockReturnValue(1),
      getAiAllowedSubscriptionStatuses: vi.fn().mockReturnValue(["trialing", "active", "past_due"]),
      getAiDefaultModel: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiDefaultMonthlyTokenBudget: vi.fn().mockReturnValue(0),
      getAiRuleForPlan: vi.fn().mockReturnValue({
        enabled: true,
        model: "gpt-4.1-mini",
        monthlyBudget: 10_000,
        allowedModalities: ["text", "image", "file"],
        maxSteps: 1,
      }),
      getAiModelForPlan: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiMonthlyTokenBudgetForPlan: vi.fn().mockReturnValue(2_000_000),
      getAiAllowedModalities: vi.fn().mockReturnValue(["text", "image", "file"]),
      getAiAllowedModalitiesForPlan: vi.fn().mockReturnValue(["text", "image", "file"]),
    }));
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { stripe_price_id: "price_growth", status: "active" },
      error: null,
    });
    const inFn = vi.fn().mockReturnThis();
    const subscriptionsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: inFn,
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
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

    expect(response.status).toBe(503);
    expect(inFn).toHaveBeenCalledWith("status", LIVE_SUBSCRIPTION_STATUSES);
  });

  it("rejects model overrides that are not allowed for the current plan", async () => {
    providerMockState.isRequestedModelAllowed.mockReturnValue(false);

    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: "gpt-5.4",
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Invalid request payload.",
      code: "invalid_model",
    });
    const { streamText } = await import("ai");
    expect(streamText).not.toHaveBeenCalled();
  });

  it("rejects unsupported attachment MIME types", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
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
              content: "Analyze this file",
              attachments: [
                {
                  type: "file",
                  mimeType: "application/json",
                  name: "payload.json",
                  data: "eyJrZXkiOiAidmFsdWUifQ==",
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        error: "Unsupported attachment type.",
      }),
    );
    const { streamText } = await import("ai");
    expect(streamText).not.toHaveBeenCalled();
  });

  it("rejects text file attachments that the default provider path cannot handle", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
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
              content: "Analyze this file",
              attachments: [
                {
                  type: "file",
                  mimeType: "text/plain",
                  name: "notes.txt",
                  data: "dGVzdA==",
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        error: "Unsupported attachment type.",
      }),
    );
    const { streamText } = await import("ai");
    expect(streamText).not.toHaveBeenCalled();
  });

  it("accepts text file attachments for anthropic provider", async () => {
    mockAiTextResponse("anthropic-ok");
    mockProviderModule({
      aiProviderName: "anthropic",
      supportsProviderFileIds: false,
    });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
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
              content: "Analyze this file",
              attachments: [
                {
                  type: "file",
                  mimeType: "text/plain",
                  name: "notes.txt",
                  data: "dGVzdA==",
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("anthropic-ok");
    await expectLatestStreamTextMessagesToMatchModelSchema();
  });

  it("accepts attachment-only PDF messages via OpenAI fileIds and persists attachment parts", async () => {
    mockAiTextResponse("pdf-ok");
    mockProviderModule({
      aiProviderName: "openai",
      supportsProviderFileIds: true,
    });

    const createThread = vi.fn().mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
    });
    const saveThreadMessages = vi.fn().mockResolvedValue(true);
    vi.doMock("@/lib/ai/threads", () => ({
      createThread,
      saveThreadMessages,
      getThread: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
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
              content: "",
              attachments: [
                {
                  type: "file",
                  mimeType: "application/pdf",
                  name: "contract.pdf",
                  fileId: "file-123",
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("pdf-ok");
    await expectLatestStreamTextMessagesToMatchModelSchema();

    const { streamText } = await import("ai");
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "file",
                data: "file-123",
                mediaType: "application/pdf",
                filename: "contract.pdf",
              },
            ],
          },
        ],
      }),
    );

    expect(createThread).toHaveBeenCalledWith({
      teamId: "team_123",
      userId: "user_123",
      title: "contract.pdf",
    });
    expect(saveThreadMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "11111111-1111-1111-1111-111111111111",
        messages: [
          expect.objectContaining({
            role: "user",
            attachments: [
              {
                type: "file",
                mimeType: "application/pdf",
                name: "contract.pdf",
                fileId: "file-123",
              },
            ],
            parts: [
              {
                type: "file",
                mediaType: "application/pdf",
                filename: "contract.pdf",
                url: "openai-file://file-123",
                providerMetadata: {
                  openai: {
                    fileId: "file-123",
                  },
                },
              },
            ],
          }),
          expect.objectContaining({
            role: "assistant",
          }),
        ],
      }),
    );
  });

  it("rejects Anthropic fileId attachments because the model message schema only supports OpenAI file IDs", async () => {
    mockProviderModule({
      aiProviderName: "anthropic",
      supportsProviderFileIds: false,
    });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
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
              content: "",
              attachments: [
                {
                  type: "file",
                  mimeType: "application/pdf",
                  name: "brief.pdf",
                  fileId: "file_ant_123",
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Invalid request payload.",
    });

    const { streamText } = await import("ai");
    expect(streamText).not.toHaveBeenCalled();
  });

  it("accepts uploaded Google file URLs and persists attachment parts", async () => {
    mockAiTextResponse("google-file-ok");
    mockProviderModule({
      aiProviderName: "google",
      supportsProviderFileIds: false,
    });

    const createThread = vi.fn().mockResolvedValue({
      id: "33333333-3333-3333-3333-333333333333",
    });
    const saveThreadMessages = vi.fn().mockResolvedValue(true);
    vi.doMock("@/lib/ai/threads", () => ({
      createThread,
      saveThreadMessages,
      getThread: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
    }));

    const uploadedUrl = "https://generativelanguage.googleapis.com/v1beta/files/file_google_123";
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: "",
              attachments: [
                {
                  type: "file",
                  mimeType: "application/pdf",
                  name: "deck.pdf",
                  url: uploadedUrl,
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("google-file-ok");
    await expectLatestStreamTextMessagesToMatchModelSchema();

    const { streamText } = await import("ai");
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "file",
                data: uploadedUrl,
                mediaType: "application/pdf",
                filename: "deck.pdf",
              },
            ],
          },
        ],
      }),
    );

    expect(createThread).toHaveBeenCalledWith({
      teamId: "team_123",
      userId: "user_123",
      title: "deck.pdf",
    });
    expect(saveThreadMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "33333333-3333-3333-3333-333333333333",
        messages: [
          expect.objectContaining({
            role: "user",
            attachments: [
              {
                type: "file",
                mimeType: "application/pdf",
                name: "deck.pdf",
                url: uploadedUrl,
              },
            ],
            parts: [
              {
                type: "file",
                mediaType: "application/pdf",
                filename: "deck.pdf",
                url: uploadedUrl,
              },
            ],
          }),
          expect.objectContaining({
            role: "assistant",
          }),
        ],
      }),
    );
  });

  it("rejects assistant-role attachments", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "assistant",
              content: "I attached a file.",
              attachments: [
                {
                  type: "file",
                  mimeType: "text/plain",
                  data: "dGVzdA==",
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ ok: false, error: "Invalid request payload." }),
    );
  });

  it("rejects non-https attachment URLs", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
          }),
        },
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
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
              content: "Review this image",
              attachments: [
                {
                  type: "image",
                  mimeType: "image/png",
                  url: "http://example.com/photo.png",
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ ok: false, error: "Invalid request payload." }),
    );
  });

  it("rejects requests with more than 16 attachments total", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
    }));

    const attachments = Array.from({ length: 6 }, (_, index) => ({
      type: "image",
      mimeType: "image/png",
      url: `https://example.com/photo-${index}.png`,
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "user", content: "set one", attachments },
            { role: "user", content: "set two", attachments },
            { role: "user", content: "set three", attachments },
          ],
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "A maximum of 16 attachments is allowed per request.",
    });
  });

  it("denies requests that use disallowed modalities", async () => {
    vi.doMock("@/lib/ai/access", () => ({
      resolveAiAccess: vi.fn().mockReturnValue({
        allowed: true,
        model: "gpt-4.1-mini",
        monthlyTokenBudget: 0,
        allowedModalities: ["text"],
        maxSteps: 1,
      }),
    }));
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("all"),
      getAiToolsEnabled: vi.fn().mockReturnValue(false),
      getAiMaxSteps: vi.fn().mockReturnValue(1),
      getAiAllowedSubscriptionStatuses: vi.fn().mockReturnValue(["trialing", "active", "past_due"]),
      getAiDefaultModel: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiDefaultMonthlyTokenBudget: vi.fn().mockReturnValue(0),
      getAiRuleForPlan: vi.fn().mockReturnValue({
        enabled: true,
        model: "gpt-4.1-mini",
        monthlyBudget: 0,
        allowedModalities: ["text"],
        maxSteps: 1,
      }),
      getAiModelForPlan: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiMonthlyTokenBudgetForPlan: vi.fn().mockReturnValue(0),
      getAiAllowedModalities: vi.fn().mockReturnValue(["text"]),
      getAiAllowedModalitiesForPlan: vi.fn().mockReturnValue(["text"]),
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
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
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
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
              content: "What is in this image?",
              attachments: [
                {
                  type: "image",
                  mimeType: "image/png",
                  url: "https://example.com/photo.png",
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Your current AI plan does not allow this attachment type.",
      code: "modality_not_allowed",
    });
    const { logAuditEvent } = await import("@/lib/audit");
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          attachmentCounts: { image: 1, file: 0, total: 1 },
        }),
      }),
    );
    const { streamText } = await import("ai");
    expect(streamText).not.toHaveBeenCalled();
  });

  it("denies multimodal requests for text-only model capability", async () => {
    vi.doMock("@/lib/ai/access", () => ({
      resolveAiAccess: vi.fn().mockReturnValue({
        allowed: true,
        model: "gpt-3.5-turbo",
        monthlyTokenBudget: 0,
        allowedModalities: ["text", "image", "file"],
        maxSteps: 1,
      }),
    }));
    const aiConfig = await import("@/lib/ai/config");
    vi.mocked(aiConfig.getAiAccessMode).mockReturnValue("all");
    vi.mocked(aiConfig.getAiDefaultModel).mockReturnValue("gpt-3.5-turbo");
    vi.mocked(aiConfig.getAiDefaultMonthlyTokenBudget).mockReturnValue(0);
    vi.mocked(aiConfig.getAiAllowedModalities).mockReturnValue(["text", "image", "file"]);
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123" } },
          }),
        },
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
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
    vi.doMock("@/lib/security/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        retryAfterSeconds: 0,
      }),
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
              content: "What is in this image?",
              attachments: [
                {
                  type: "image",
                  mimeType: "image/png",
                  url: "https://example.com/photo.png",
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Your current AI plan does not allow this attachment type.",
      code: "modality_not_allowed",
    });
    const { logAuditEvent } = await import("@/lib/audit");
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          reason: "model_modality_mismatch",
        }),
      }),
    );
  });
});
