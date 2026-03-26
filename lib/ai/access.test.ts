import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = {
  AI_ACCESS_MODE: process.env.AI_ACCESS_MODE,
  AI_DEFAULT_MODEL: process.env.AI_DEFAULT_MODEL,
  AI_DEFAULT_MONTHLY_TOKEN_BUDGET: process.env.AI_DEFAULT_MONTHLY_TOKEN_BUDGET,
  AI_ALLOWED_MODALITIES: process.env.AI_ALLOWED_MODALITIES,
  AI_MAX_STEPS: process.env.AI_MAX_STEPS,
  AI_PLAN_RULES_JSON: process.env.AI_PLAN_RULES_JSON,
  AI_PLAN_MODEL_MAP_JSON: process.env.AI_PLAN_MODEL_MAP_JSON,
  AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON: process.env.AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON,
  AI_PLAN_MODALITIES_MAP_JSON: process.env.AI_PLAN_MODALITIES_MAP_JSON,
};

function resetAiEnv() {
  process.env.AI_ACCESS_MODE = ORIGINAL_ENV.AI_ACCESS_MODE;
  process.env.AI_DEFAULT_MODEL = ORIGINAL_ENV.AI_DEFAULT_MODEL;
  process.env.AI_DEFAULT_MONTHLY_TOKEN_BUDGET = ORIGINAL_ENV.AI_DEFAULT_MONTHLY_TOKEN_BUDGET;
  process.env.AI_ALLOWED_MODALITIES = ORIGINAL_ENV.AI_ALLOWED_MODALITIES;
  process.env.AI_MAX_STEPS = ORIGINAL_ENV.AI_MAX_STEPS;
  process.env.AI_PLAN_RULES_JSON = ORIGINAL_ENV.AI_PLAN_RULES_JSON;
  process.env.AI_PLAN_MODEL_MAP_JSON = ORIGINAL_ENV.AI_PLAN_MODEL_MAP_JSON;
  process.env.AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON =
    ORIGINAL_ENV.AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON;
  process.env.AI_PLAN_MODALITIES_MAP_JSON = ORIGINAL_ENV.AI_PLAN_MODALITIES_MAP_JSON;
}

describe("resolveAiAccess", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetAiEnv();
  });

  afterEach(() => {
    resetAiEnv();
  });

  it("denies all-mode access when default model is missing", async () => {
    process.env.AI_ACCESS_MODE = "all";
    delete process.env.AI_DEFAULT_MODEL;
    process.env.AI_DEFAULT_MONTHLY_TOKEN_BUDGET = "5000";

    const { resolveAiAccess } = await import("./access");
    const result = resolveAiAccess({ effectivePlanKey: "pro" });

    expect(result).toEqual({
      allowed: false,
      model: null,
      monthlyTokenBudget: 0,
      allowedModalities: ["text"],
      maxSteps: 1,
      denialReason: "default_model_missing",
    });
  });

  it("allows all-mode access with configured default model and budget", async () => {
    process.env.AI_ACCESS_MODE = "all";
    process.env.AI_DEFAULT_MODEL = "gpt-5-mini";
    process.env.AI_DEFAULT_MONTHLY_TOKEN_BUDGET = "12000";

    const { resolveAiAccess } = await import("./access");
    const result = resolveAiAccess({ effectivePlanKey: null });

    expect(result).toEqual({
      allowed: true,
      model: "gpt-5-mini",
      monthlyTokenBudget: 12000,
      allowedModalities: ["text"],
      maxSteps: 1,
    });
  });

  it("denies by-plan access when plan is not enabled", async () => {
    process.env.AI_ACCESS_MODE = "by_plan";
    process.env.AI_PLAN_RULES_JSON = JSON.stringify({
      free: { enabled: false, model: null, monthlyBudget: 0 },
      starter: {
        enabled: false,
        model: "gpt-5-mini",
        monthlyBudget: 2000,
        allowedModalities: ["text", "image"],
      },
      growth: { enabled: true, model: "gpt-5", monthlyBudget: 8000 },
      pro: { enabled: true, model: "gpt-5", monthlyBudget: 20000 },
    });

    const { resolveAiAccess } = await import("./access");
    const result = resolveAiAccess({ effectivePlanKey: "starter" });

    expect(result).toEqual({
      allowed: false,
      model: null,
      monthlyTokenBudget: 0,
      allowedModalities: ["text", "image"],
      maxSteps: 1,
      denialReason: "plan_disabled",
    });
  });

  it("allows by-plan access with per-plan model and budget", async () => {
    process.env.AI_ACCESS_MODE = "by_plan";
    process.env.AI_PLAN_RULES_JSON = JSON.stringify({
      free: { enabled: false, model: null, monthlyBudget: 0 },
      starter: {
        enabled: true,
        model: "gpt-5-mini",
        monthlyBudget: 2500,
        allowedModalities: ["text", "image", "file"],
      },
      growth: { enabled: true, model: "gpt-5", monthlyBudget: 9000 },
      pro: { enabled: true, model: "gpt-5", monthlyBudget: 24000 },
    });

    const { resolveAiAccess } = await import("./access");
    const result = resolveAiAccess({ effectivePlanKey: "starter" });

    expect(result).toEqual({
      allowed: true,
      model: "gpt-5-mini",
      monthlyTokenBudget: 2500,
      allowedModalities: ["text", "image", "file"],
      maxSteps: 1,
    });
  });

  it("denies paid-mode access for free plan even when free has a model entry", async () => {
    process.env.AI_ACCESS_MODE = "paid";
    process.env.AI_PLAN_MODEL_MAP_JSON = JSON.stringify({
      starter: "gpt-5-mini",
      growth: "gpt-5",
      pro: "gpt-5",
    });
    process.env.AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON = JSON.stringify({
      starter: 2000,
      growth: 9000,
      pro: 25000,
    });
    process.env.AI_PLAN_MODALITIES_MAP_JSON = JSON.stringify({
      starter: ["text", "image"],
      growth: ["text", "file"],
      pro: ["text", "image", "file"],
    });

    const { resolveAiAccess } = await import("./access");
    const result = resolveAiAccess({ effectivePlanKey: "free" });

    expect(result).toEqual({
      allowed: false,
      model: null,
      monthlyTokenBudget: 0,
      allowedModalities: ["text"],
      maxSteps: 1,
      denialReason: "plan_not_allowed",
    });
  });

  it("allows paid-mode access for configured paid plans", async () => {
    process.env.AI_ACCESS_MODE = "paid";
    process.env.AI_PLAN_MODEL_MAP_JSON = JSON.stringify({
      starter: "gpt-5-mini",
      growth: "gpt-5",
      pro: "gpt-5",
    });
    process.env.AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON = JSON.stringify({
      starter: 2500,
      growth: 9000,
      pro: 25000,
    });
    process.env.AI_PLAN_MODALITIES_MAP_JSON = JSON.stringify({
      starter: ["text", "image"],
      growth: ["text", "image", "file"],
      pro: ["text", "image", "file"],
    });

    const { resolveAiAccess } = await import("./access");
    const result = resolveAiAccess({ effectivePlanKey: "growth" });

    expect(result).toEqual({
      allowed: true,
      model: "gpt-5",
      monthlyTokenBudget: 9000,
      allowedModalities: ["text", "image", "file"],
      maxSteps: 1,
    });
  });

  it("denies paid-mode access when plan model is missing and includes plan modalities", async () => {
    process.env.AI_ACCESS_MODE = "paid";
    process.env.AI_PLAN_MODEL_MAP_JSON = JSON.stringify({
      starter: "gpt-5-mini",
      growth: null,
      pro: "gpt-5",
    });
    process.env.AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON = JSON.stringify({
      starter: 2500,
      growth: 9000,
      pro: 25000,
    });
    process.env.AI_PLAN_MODALITIES_MAP_JSON = JSON.stringify({
      starter: ["text", "image"],
      growth: ["text", "file"],
      pro: ["text", "image", "file"],
    });

    const { resolveAiAccess } = await import("./access");
    const result = resolveAiAccess({ effectivePlanKey: "growth" });

    expect(result).toEqual({
      allowed: false,
      model: null,
      monthlyTokenBudget: 0,
      allowedModalities: ["text", "file"],
      maxSteps: 1,
      denialReason: "plan_not_allowed",
    });
  });
});
