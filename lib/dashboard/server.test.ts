import { beforeEach, describe, expect, it, vi } from "vitest";

describe("getDashboardBaseData", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/ai/provider", () => ({
      isAiProviderConfigured: false,
      isAiProviderConfiguredForModel: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("next/headers", () => ({
      cookies: async () => ({
        get: vi.fn().mockReturnValue({
          value: "abcdefghijklmnopqrstuvwx",
        }),
      }),
    }));
  });

  it("deduplicates repeated calls via react cache", async () => {
    const user = { id: "user-1", email: "user@example.com" };
    const getUser = vi.fn().mockResolvedValue({ data: { user } });
    const from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: user.id,
                  full_name: "User Example",
                  avatar_url: null,
                  created_at: "2024-01-01T00:00:00.000Z",
                },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "team_memberships") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                returns: async () => ({
                  data: [{ team_id: "team-1", role: "owner", teams: { name: "Team One" } }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const createClient = vi.fn().mockResolvedValue({
      auth: { getUser },
      from,
    });
    const getCachedTeamContextForUser = vi.fn().mockResolvedValue({
      teamId: "team-1",
      teamName: "Team One",
      role: "owner",
    });

    vi.doMock("@/lib/supabase/server", () => ({ createClient }));
    vi.doMock("@/lib/team-context-cache", () => ({ getCachedTeamContextForUser }));
    vi.doMock("react", async () => {
      const actual = await vi.importActual<typeof import("react")>("react");
      return {
        ...actual,
        cache: <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => Promise<TResult>) => {
          let hasValue = false;
          let cachedValue: Promise<TResult> | null = null;
          return (...args: TArgs) => {
            if (!hasValue) {
              hasValue = true;
              cachedValue = fn(...args);
            }
            return cachedValue as Promise<TResult>;
          };
        },
      };
    });
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn((path: string) => {
        throw new Error(`redirect:${path}`);
      }),
    }));

    const { getDashboardBaseData } = await import("./server");
    const first = await getDashboardBaseData();
    const second = await getDashboardBaseData();

    expect(first).toEqual(second);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(getCachedTeamContextForUser).toHaveBeenCalledTimes(1);
  });
});

describe("getDashboardAiUiGate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("hides AI UI when OpenAI is not configured", async () => {
    vi.doMock("@/lib/ai/provider", () => ({
      isAiProviderConfigured: false,
      isAiProviderConfiguredForModel: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("all"),
      getAiAllowedSubscriptionStatuses: vi.fn().mockReturnValue(["active"]),
    }));
    vi.doMock("@/lib/ai/access", () => ({
      resolveAiAccess: vi.fn().mockReturnValue({
        allowed: true,
        model: "gpt-4.1-mini",
        monthlyTokenBudget: 0,
        allowedModalities: ["text"],
        maxSteps: 1,
      }),
    }));

    const { getDashboardAiUiGate } = await import("./server");
    const gate = await getDashboardAiUiGate({} as never, "team_123");

    expect(gate).toEqual({
      isVisibleInUi: false,
      reason: "ai_not_configured",
      effectivePlanKey: null,
      accessMode: "all",
    });
  });

  it("hides AI UI when team plan is ineligible", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const inFn = vi.fn().mockReturnThis();
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: inFn,
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle,
      })),
    };

    vi.doMock("@/lib/ai/provider", () => ({
      isAiProviderConfigured: true,
      isAiProviderConfiguredForModel: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("paid"),
      getAiAllowedSubscriptionStatuses: vi.fn().mockReturnValue(["active"]),
    }));
    vi.doMock("@/lib/ai/access", () => ({
      resolveAiAccess: vi.fn().mockReturnValue({
        allowed: false,
        model: null,
        monthlyTokenBudget: 0,
        allowedModalities: ["text"],
        maxSteps: 1,
        denialReason: "plan_not_allowed",
      }),
    }));

    const { getDashboardAiUiGate } = await import("./server");
    const gate = await getDashboardAiUiGate(supabase as never, "team_123");

    expect(gate).toEqual({
      isVisibleInUi: false,
      reason: "plan_not_allowed",
      effectivePlanKey: "free",
      accessMode: "paid",
    });
    expect(inFn).toHaveBeenCalled();
  });

  it("shows AI UI when policy allows access", async () => {
    vi.doMock("@/lib/ai/provider", () => ({
      isAiProviderConfigured: true,
      isAiProviderConfiguredForModel: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("all"),
      getAiAllowedSubscriptionStatuses: vi.fn().mockReturnValue(["active"]),
    }));
    vi.doMock("@/lib/ai/access", () => ({
      resolveAiAccess: vi.fn().mockReturnValue({
        allowed: true,
        model: "gpt-4.1-mini",
        monthlyTokenBudget: 0,
        allowedModalities: ["text"],
        maxSteps: 1,
      }),
    }));

    const { getDashboardAiUiGate } = await import("./server");
    const gate = await getDashboardAiUiGate({} as never, "team_123");

    expect(gate).toEqual({
      isVisibleInUi: true,
      reason: "enabled",
      effectivePlanKey: "free",
      accessMode: "all",
    });
  });

  it("hides AI UI when the configured model's provider key is missing", async () => {
    vi.doMock("@/lib/ai/provider", () => ({
      isAiProviderConfigured: true,
      isAiProviderConfiguredForModel: vi.fn().mockReturnValue(false),
    }));
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("all"),
      getAiAllowedSubscriptionStatuses: vi.fn().mockReturnValue(["active"]),
    }));
    vi.doMock("@/lib/ai/access", () => ({
      resolveAiAccess: vi.fn().mockReturnValue({
        allowed: true,
        model: "anthropic:claude-opus-test",
        monthlyTokenBudget: 0,
        allowedModalities: ["text"],
        maxSteps: 1,
      }),
    }));

    const { getDashboardAiUiGate } = await import("./server");
    const gate = await getDashboardAiUiGate({} as never, "team_123");

    expect(gate).toEqual({
      isVisibleInUi: false,
      reason: "ai_not_configured",
      effectivePlanKey: "free",
      accessMode: "all",
    });
  });

  it("reuses provided billing context without re-querying subscriptions", async () => {
    const from = vi.fn(() => {
      throw new Error("AI gate should not query subscriptions when billing context is provided");
    });
    const supabase = { from };

    vi.doMock("@/lib/ai/provider", () => ({
      isAiProviderConfigured: true,
      isAiProviderConfiguredForModel: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/ai/config", () => ({
      getAiAccessMode: vi.fn().mockReturnValue("paid"),
      getAiAllowedSubscriptionStatuses: vi.fn().mockReturnValue(["active"]),
    }));
    vi.doMock("@/lib/ai/access", () => ({
      resolveAiAccess: vi.fn().mockReturnValue({
        allowed: true,
        model: "gpt-4.1-mini",
        monthlyTokenBudget: 0,
        allowedModalities: ["text"],
        maxSteps: 1,
      }),
    }));

    const { getDashboardAiUiGate } = await import("./server");
    const gate = await getDashboardAiUiGate(supabase as never, "team_123", {
      billingContext: {
        effectivePlanKey: "growth",
        subscription: {
          status: "active",
          stripe_price_id: "price_growth",
          seat_quantity: 3,
          current_period_end: null,
          cancel_at_period_end: false,
        },
      },
    });

    expect(gate).toEqual({
      isVisibleInUi: true,
      reason: "enabled",
      effectivePlanKey: "growth",
      accessMode: "paid",
    });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("getUsageMonthlyTotals", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function createMonthlyTotalsQuery({
    data,
    error = null,
  }: {
    data: Array<{ month_start: string; used_tokens: number; reserved_tokens: number }> | null;
    error?: { message: string } | null;
  }) {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      returns: vi.fn().mockResolvedValue({ data, error }),
    };
  }

  function createUsageRowsQuery({
    data,
    error = null,
  }: {
    data: Array<{ created_at: string; prompt_tokens: number; completion_tokens: number }> | null;
    error?: { message: string } | null;
  }) {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      returns: vi.fn().mockResolvedValue({ data, error }),
    };
  }

  it("falls back to raw ai usage rows when monthly totals are empty", async () => {
    const monthlyTotalsQuery = createMonthlyTotalsQuery({ data: [] });
    const usageRowsQuery = createUsageRowsQuery({
      data: [
        {
          created_at: "2026-03-29T21:42:31.964318+00:00",
          prompt_tokens: 73,
          completion_tokens: 336,
        },
        {
          created_at: "2026-03-29T21:42:07.642582+00:00",
          prompt_tokens: 72,
          completion_tokens: 12,
        },
        {
          created_at: "2026-02-10T10:00:00.000000+00:00",
          prompt_tokens: 10,
          completion_tokens: 5,
        },
      ],
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "ai_usage_monthly_totals") {
          return monthlyTotalsQuery;
        }
        if (table === "ai_usage") {
          return usageRowsQuery;
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const { getUsageMonthlyTotals } = await import("./server");
    const result = await getUsageMonthlyTotals(supabase as never, "team_123");

    expect(result).toEqual([
      { month_start: "2026-03-01", used_tokens: 493, reserved_tokens: 0 },
      { month_start: "2026-02-01", used_tokens: 15, reserved_tokens: 0 },
    ]);
  });

  it("returns monthly totals directly when available", async () => {
    const monthlyTotalsQuery = createMonthlyTotalsQuery({
      data: [
        { month_start: "2026-03-01", used_tokens: 400, reserved_tokens: 120 },
        { month_start: "2026-02-01", used_tokens: 90, reserved_tokens: 15 },
      ],
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "ai_usage_monthly_totals") {
          return monthlyTotalsQuery;
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const { getUsageMonthlyTotals } = await import("./server");
    const result = await getUsageMonthlyTotals(supabase as never, "team_123");

    expect(result).toEqual([
      { month_start: "2026-03-01", used_tokens: 400, reserved_tokens: 120 },
      { month_start: "2026-02-01", used_tokens: 90, reserved_tokens: 15 },
    ]);
  });
});

describe("getDashboardCanSwitchTeams", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns null when counting team memberships fails", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            count: null,
            error: { message: "boom" },
          }),
        }),
      })),
    };

    const { getDashboardCanSwitchTeams } = await import("./server");
    const result = await getDashboardCanSwitchTeams(supabase as never, "user_123");

    expect(result).toBeNull();
  });

  it("returns true when the user belongs to multiple teams", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            count: 2,
            error: null,
          }),
        }),
      })),
    };

    const { getDashboardCanSwitchTeams } = await import("./server");
    const result = await getDashboardCanSwitchTeams(supabase as never, "user_123");

    expect(result).toBe(true);
  });
});
