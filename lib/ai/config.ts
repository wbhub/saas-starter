import { env } from "@/lib/env";
import {
  ALL_SUBSCRIPTION_STATUSES,
  PLAN_KEYS,
  type PlanKey,
  type SubscriptionStatus,
} from "@/lib/stripe/plans";

type AiPlanModelMap = Record<PlanKey, string | null>;
type AiPlanMonthlyTokenBudgetMap = Record<PlanKey, number>;

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

export function getAiModelForPlan(planKey: PlanKey) {
  return AI_PLAN_MODEL_MAP[planKey];
}

export function getAiMonthlyTokenBudgetForPlan(planKey: PlanKey) {
  return AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP[planKey];
}
