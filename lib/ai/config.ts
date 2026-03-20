import { env } from "@/lib/env";
import { type EffectivePlanKey } from "@/lib/billing/effective-plan";
import {
  ALL_SUBSCRIPTION_STATUSES,
  PLAN_KEYS,
  type PlanKey,
  type SubscriptionStatus,
} from "@/lib/stripe/plans";

export const AI_ACCESS_MODES = ["paid", "all", "by_plan"] as const;
export type AiAccessMode = (typeof AI_ACCESS_MODES)[number];

type AiPlanModelMap = Record<PlanKey, string | null>;
type AiPlanMonthlyTokenBudgetMap = Record<PlanKey, number>;
type AiByPlanRule = {
  enabled: boolean;
  model: string | null;
  monthlyBudget: number;
};
type AiByPlanRules = Record<EffectivePlanKey, AiByPlanRule>;

const AI_POLICY_PLAN_KEYS = ["free", ...PLAN_KEYS] as const;

const DEFAULT_AI_PLAN_MODEL_MAP: AiPlanModelMap = {
  starter: null,
  growth: null,
  pro: null,
};

const DEFAULT_AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP: AiPlanMonthlyTokenBudgetMap = {
  starter: 0,
  growth: 0,
  pro: 0,
};

const DEFAULT_AI_BY_PLAN_RULES: AiByPlanRules = {
  free: { enabled: false, model: null, monthlyBudget: 0 },
  starter: { enabled: false, model: null, monthlyBudget: 0 },
  growth: { enabled: false, model: null, monthlyBudget: 0 },
  pro: { enabled: false, model: null, monthlyBudget: 0 },
};

function parseJsonObjectEnv(rawValue: string | undefined, envKey: string) {
  if (!rawValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("value must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    console.warn(`Invalid ${envKey}; using defaults.`, error);
    return null;
  }
}

function parseAllowedSubscriptionStatuses(
  rawValue: string | undefined,
): readonly SubscriptionStatus[] {
  if (!rawValue) {
    return [];
  }

  const parsed = rawValue
    .split(",")
    .map((status) => status.trim())
    .filter((status): status is SubscriptionStatus =>
      (ALL_SUBSCRIPTION_STATUSES as readonly string[]).includes(status),
    );

  if (!parsed.length) {
    console.warn("AI_ALLOWED_SUBSCRIPTION_STATUSES yielded no valid statuses; AI access is disabled.");
    return [];
  }

  return parsed;
}

function parseAiAccessMode(rawValue: string | undefined): AiAccessMode {
  if (!rawValue) {
    return "paid";
  }
  if ((AI_ACCESS_MODES as readonly string[]).includes(rawValue)) {
    return rawValue as AiAccessMode;
  }
  console.warn(`Invalid AI_ACCESS_MODE "${rawValue}"; defaulting to "paid".`);
  return "paid";
}

function parseNonNegativeInteger(rawValue: string | undefined, envKey: string): number {
  if (!rawValue) {
    return 0;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.warn(`Invalid ${envKey}; defaulting to 0.`);
    return 0;
  }
  return Math.floor(parsed);
}

function parsePlanModelMap(rawValue: string | undefined): AiPlanModelMap {
  const parsed = parseJsonObjectEnv(rawValue, "AI_PLAN_MODEL_MAP_JSON");
  if (!parsed) {
    return DEFAULT_AI_PLAN_MODEL_MAP;
  }

  const configured: Partial<AiPlanModelMap> = {};
  for (const planKey of PLAN_KEYS) {
    const value = parsed[planKey];
    if (value === null || value === undefined || value === "") {
      configured[planKey] = null;
      continue;
    }
    if (typeof value !== "string") {
      console.warn(`Invalid AI model mapping for plan "${planKey}"; disabling AI for this plan.`);
      configured[planKey] = null;
      continue;
    }
    configured[planKey] = value.trim();
  }

  return {
    starter: configured.starter ?? null,
    growth: configured.growth ?? null,
    pro: configured.pro ?? null,
  };
}

function parsePlanMonthlyTokenBudgetMap(
  rawValue: string | undefined,
): AiPlanMonthlyTokenBudgetMap {
  const parsed = parseJsonObjectEnv(rawValue, "AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON");
  if (!parsed) {
    return DEFAULT_AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP;
  }

  const configured: Partial<AiPlanMonthlyTokenBudgetMap> = {};
  for (const planKey of PLAN_KEYS) {
    const value = parsed[planKey];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      configured[planKey] = 0;
      continue;
    }
    configured[planKey] = Math.floor(value);
  }

  return {
    starter: configured.starter ?? 0,
    growth: configured.growth ?? 0,
    pro: configured.pro ?? 0,
  };
}

function parseAiByPlanRules(rawValue: string | undefined): AiByPlanRules {
  const parsed = parseJsonObjectEnv(rawValue, "AI_PLAN_RULES_JSON");
  if (!parsed) {
    return DEFAULT_AI_BY_PLAN_RULES;
  }

  const configured: Partial<AiByPlanRules> = {};
  for (const planKey of AI_POLICY_PLAN_KEYS) {
    const value = parsed[planKey];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      configured[planKey] = { ...DEFAULT_AI_BY_PLAN_RULES[planKey] };
      continue;
    }

    const maybeRule = value as {
      enabled?: unknown;
      model?: unknown;
      monthlyBudget?: unknown;
    };
    const enabled = maybeRule.enabled === true;
    const model =
      typeof maybeRule.model === "string" && maybeRule.model.trim().length > 0
        ? maybeRule.model.trim()
        : null;
    const monthlyBudget =
      typeof maybeRule.monthlyBudget === "number" &&
      Number.isFinite(maybeRule.monthlyBudget) &&
      maybeRule.monthlyBudget >= 0
        ? Math.floor(maybeRule.monthlyBudget)
        : 0;

    configured[planKey] = { enabled, model, monthlyBudget };
  }

  return {
    free: configured.free ?? { ...DEFAULT_AI_BY_PLAN_RULES.free },
    starter: configured.starter ?? { ...DEFAULT_AI_BY_PLAN_RULES.starter },
    growth: configured.growth ?? { ...DEFAULT_AI_BY_PLAN_RULES.growth },
    pro: configured.pro ?? { ...DEFAULT_AI_BY_PLAN_RULES.pro },
  };
}

const AI_ACCESS_MODE = parseAiAccessMode(env.AI_ACCESS_MODE);
const AI_DEFAULT_MODEL = env.AI_DEFAULT_MODEL ?? null;
const AI_DEFAULT_MONTHLY_TOKEN_BUDGET = parseNonNegativeInteger(
  env.AI_DEFAULT_MONTHLY_TOKEN_BUDGET,
  "AI_DEFAULT_MONTHLY_TOKEN_BUDGET",
);
const AI_PLAN_RULES = parseAiByPlanRules(env.AI_PLAN_RULES_JSON);
const AI_ALLOWED_SUBSCRIPTION_STATUSES = parseAllowedSubscriptionStatuses(
  env.AI_ALLOWED_SUBSCRIPTION_STATUSES,
);
const AI_PLAN_MODEL_MAP = parsePlanModelMap(env.AI_PLAN_MODEL_MAP_JSON);
const AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP = parsePlanMonthlyTokenBudgetMap(
  env.AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON,
);

export function getAiAllowedSubscriptionStatuses() {
  return AI_ALLOWED_SUBSCRIPTION_STATUSES;
}

export function getAiAccessMode() {
  return AI_ACCESS_MODE;
}

export function getAiDefaultModel() {
  return AI_DEFAULT_MODEL;
}

export function getAiDefaultMonthlyTokenBudget() {
  return AI_DEFAULT_MONTHLY_TOKEN_BUDGET;
}

export function getAiRuleForPlan(planKey: EffectivePlanKey) {
  return AI_PLAN_RULES[planKey];
}

export function getAiModelForPlan(planKey: PlanKey) {
  return AI_PLAN_MODEL_MAP[planKey];
}

export function getAiMonthlyTokenBudgetForPlan(planKey: PlanKey) {
  return AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP[planKey];
}
