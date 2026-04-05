import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const aiMockState = vi.hoisted(() => ({
  streamObject: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    streamObject: aiMockState.streamObject,
  };
});

function mockStreamObjectUnavailable() {
  aiMockState.streamObject.mockReset();
  aiMockState.streamObject.mockImplementation(() => {
    throw { status: 503 };
  });
}

function mockStreamObjectSuccess() {
  aiMockState.streamObject.mockReset();
  aiMockState.streamObject.mockReturnValue({
    toTextStreamResponse: vi.fn().mockReturnValue(
      new Response("data: {}\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    ),
  });
}

describe("POST /api/ai/object access and gating", () => {
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
      logger: { error: vi.fn(), warn: vi.fn() },
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
      isAiProviderConfiguredForModel: vi.fn().mockReturnValue(true),
      getAiProviderForModel: vi.fn().mockReturnValue("openai"),
      modelSupportsProviderFileIds: vi.fn().mockReturnValue(true),
      supportsOpenAiFileIds: true,
      providerSupportsModalities: vi.fn().mockReturnValue(true),
      isRequestedModelAllowed: vi.fn().mockReturnValue(true),
      getAiLanguageModel: vi.fn().mockReturnValue("provider-model"),
    }));
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
          .mockResolvedValueOnce({ data: null, error: null }),
        from: vi.fn(() => ({
          insert: vi.fn().mockResolvedValue({ error: null }),
        })),
      }),
    }));
    mockStreamObjectUnavailable();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({ data: { user: null } }),
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
      new Request("http://localhost/api/ai/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName: "sentiment", prompt: "analyze this" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unauthorized",
    });
  });

  it("returns 429 when user rate limit is exceeded", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "user@example.com" } },
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
        .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 30 })
        .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName: "sentiment", prompt: "analyze this" }),
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
  });

  it("returns 400 when body fails schema validation", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "user_123", email: "user@example.com" } },
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
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));

    const { POST } = await import("./route");
    // schemaName fails min(1) trim validation
    const response = await POST(
      new Request("http://localhost/api/ai/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName: "   ", prompt: "analyze this" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "Invalid request payload.",
    });
  });

  // Shared setup for tests that reach the schema lookup and AI call
  function mockAuthenticatedSubscribedUser() {
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
            data: { user: { id: "user_123", email: "user@example.com" } },
          }),
        },
        from: vi.fn((table: string) => {
          if (table === "subscriptions") return subscriptionsQuery;
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
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));
  }

  it("returns 400 with unknown_schema code when schemaName is not in the registry", async () => {
    mockAuthenticatedSubscribedUser();
    mockStreamObjectSuccess();

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName: "nonexistent_schema", prompt: "analyze this" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unknown schema name. Check the available schemas and try again.",
      code: "unknown_schema",
    });
    const { streamObject } = await import("ai");
    expect(streamObject).not.toHaveBeenCalled();
  });

  it("returns 403 when plan access is required and user has no active subscription", async () => {
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
            data: { user: { id: "user_123", email: "user@example.com" } },
          }),
        },
        from: vi.fn((table: string) => {
          if (table === "subscriptions") return subscriptionsQuery;
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
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName: "sentiment", prompt: "analyze this" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "AI access requires an eligible paid plan.",
      code: "plan_required",
    });
    const { streamObject } = await import("ai");
    expect(streamObject).not.toHaveBeenCalled();
  });

  it("returns 503 when upstream AI provider is unavailable", async () => {
    mockAuthenticatedSubscribedUser();
    // mockStreamObjectUnavailable already called in beforeEach

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
    const { streamObject } = await import("ai");
    expect(streamObject).toHaveBeenCalledTimes(1);
  });

  it("allows free users in all access mode", async () => {
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("all"),
      getAiToolsEnabled: vi.fn().mockReturnValue(false),
      getAiMaxSteps: vi.fn().mockReturnValue(1),
      getAiAllowedSubscriptionStatuses: vi.fn().mockReturnValue(["trialing", "active", "past_due"]),
      getAiDefaultModel: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiDefaultMonthlyTokenBudget: vi.fn().mockReturnValue(0),
      getAiRuleForPlan: vi.fn(),
      getAiModelForPlan: vi.fn().mockReturnValue("gpt-4.1-mini"),
      getAiMonthlyTokenBudgetForPlan: vi.fn().mockReturnValue(0),
      getAiAllowedModalities: vi.fn().mockReturnValue(["text"]),
      getAiAllowedModalitiesForPlan: vi.fn().mockReturnValue(["text"]),
    }));
    mockAuthenticatedSubscribedUser();
    // streamObject still throws 503 — we just verify it was reached

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaName: "sentiment", prompt: "analyze this" }),
      }),
    );

    // The call reached streamObject (which threw 503), confirming no gating blocked it
    expect(response.status).toBe(503);
    const { streamObject } = await import("ai");
    expect(streamObject).toHaveBeenCalledTimes(1);
  });
});
