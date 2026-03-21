import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("lib/ai/config env parsing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to paid mode with safe defaults", async () => {
    const config = await import("./config");

    expect(config.getAiAccessMode()).toBe("paid");
    expect(config.getAiDefaultModel()).toBeNull();
    expect(config.getAiDefaultMonthlyTokenBudget()).toBe(0);
    expect(config.getAiRuleForPlan("free")).toEqual({
      enabled: false,
      model: null,
      monthlyBudget: 0,
      allowedModalities: ["text"],
    });
    expect(config.getAiAllowedModalities()).toEqual(["text"]);
  });

  it("falls back to paid mode when AI_ACCESS_MODE is invalid", async () => {
    vi.stubEnv("AI_ACCESS_MODE", "everything");

    const config = await import("./config");
    expect(config.getAiAccessMode()).toBe("paid");
  });

  it("parses by_plan rules and default monthly budget values", async () => {
    vi.stubEnv("AI_ACCESS_MODE", "by_plan");
    vi.stubEnv("AI_DEFAULT_MONTHLY_TOKEN_BUDGET", "1250.9");
    vi.stubEnv("AI_ALLOWED_MODALITIES", "text,image,file");
    vi.stubEnv(
      "AI_PLAN_RULES_JSON",
      JSON.stringify({
        free: {
          enabled: true,
          model: "gpt-4.1-mini",
          monthlyBudget: 1000.2,
          allowedModalities: ["text", "image"],
        },
        starter: {
          enabled: true,
          model: "gpt-4.1",
          monthlyBudget: 2000,
          allowedModalities: ["image"],
        },
        growth: { enabled: false, model: "gpt-4.1", monthlyBudget: -4 },
        pro: { enabled: true, model: null, monthlyBudget: 9999, allowedModalities: ["text", "file"] },
      }),
    );
    vi.stubEnv(
      "AI_PLAN_MODALITIES_MAP_JSON",
      JSON.stringify({
        starter: ["text", "image"],
        growth: ["text", "file"],
        pro: ["text", "image", "file"],
      }),
    );

    const config = await import("./config");

    expect(config.getAiAccessMode()).toBe("by_plan");
    expect(config.getAiDefaultMonthlyTokenBudget()).toBe(1250);
    expect(config.getAiRuleForPlan("free")).toEqual({
      enabled: true,
      model: "gpt-4.1-mini",
      monthlyBudget: 1000,
      allowedModalities: ["text", "image"],
    });
    expect(config.getAiRuleForPlan("growth")).toEqual({
      enabled: false,
      model: "gpt-4.1",
      monthlyBudget: 0,
      allowedModalities: ["text", "image", "file"],
    });
    expect(config.getAiRuleForPlan("pro")).toEqual({
      enabled: true,
      model: null,
      monthlyBudget: 9999,
      allowedModalities: ["text", "file"],
    });
    expect(config.getAiAllowedModalities()).toEqual(["text", "image", "file"]);
    expect(config.getAiAllowedModalitiesForPlan("growth")).toEqual(["text", "file"]);
  });
});
