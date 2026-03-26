import { env } from "@/lib/env";
import { type EffectivePlanKey } from "@/lib/billing/effective-plan";
import { logger } from "@/lib/logger";
import {
  ALL_SUBSCRIPTION_STATUSES,
  PLAN_KEYS,
  type PlanKey,
  type SubscriptionStatus,
} from "@/lib/stripe/plans";

export const AI_ACCESS_MODES = ["paid", "all", "by_plan"] as const;
export type AiAccessMode = (typeof AI_ACCESS_MODES)[number];
export const AI_MODALITIES = ["text", "image", "file"] as const;
export type AiModality = (typeof AI_MODALITIES)[number];

type AiPlanModelMap = Record<PlanKey, string | null>;
type AiPlanMonthlyTokenBudgetMap = Record<PlanKey, number>;
type AiPlanModalitiesMap = Record<PlanKey, readonly AiModality[]>;
type AiByPlanRule = {
  enabled: boolean;
  model: string | null;
  monthlyBudget: number;
  allowedModalities: readonly AiModality[];
  maxSteps: number;
};
type AiByPlanRules = Record<EffectivePlanKey, AiByPlanRule>;

const AI_POLICY_PLAN_KEYS = ["free", ...PLAN_KEYS] as const;

const DEFAULT_AI_PLAN_MODEL_MAP: AiPlanModelMap = Object.fromEntries(
  PLAN_KEYS.map((planKey) => [planKey, null] as const),
) as AiPlanModelMap;

const DEFAULT_AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP: AiPlanMonthlyTokenBudgetMap = Object.fromEntries(
  PLAN_KEYS.map((planKey) => [planKey, 0] as const),
) as AiPlanMonthlyTokenBudgetMap;
const DEFAULT_AI_ALLOWED_MODALITIES: readonly AiModality[] = ["text"];

const DEFAULT_AI_MAX_STEPS = 1;
const MAX_AI_STEPS_CAP = 25;

const DEFAULT_AI_BY_PLAN_RULES: AiByPlanRules = Object.fromEntries(
  AI_POLICY_PLAN_KEYS.map((planKey) => [
    planKey,
    {
      enabled: false,
      model: null,
      monthlyBudget: 0,
      allowedModalities: DEFAULT_AI_ALLOWED_MODALITIES,
      maxSteps: DEFAULT_AI_MAX_STEPS,
    },
  ]),
) as AiByPlanRules;

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
    logger.warn(`Invalid ${envKey}; using defaults.`, {
      envKey,
      fallbackBehavior: "defaults",
      error,
    });
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
    logger.warn(
      "AI_ALLOWED_SUBSCRIPTION_STATUSES yielded no valid statuses; AI access is disabled.",
      {
        envKey: "AI_ALLOWED_SUBSCRIPTION_STATUSES",
        fallbackBehavior: "access_disabled",
      },
    );
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
  logger.warn(`Invalid AI_ACCESS_MODE "${rawValue}"; defaulting to "paid".`, {
    envKey: "AI_ACCESS_MODE",
    invalidValue: rawValue,
    fallbackBehavior: "paid",
  });
  return "paid";
}

function parseNonNegativeInteger(rawValue: string | undefined, envKey: string): number {
  if (!rawValue) {
    return 0;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    logger.warn(`Invalid ${envKey}; defaulting to 0.`, {
      envKey,
      invalidValue: rawValue,
      fallbackBehavior: 0,
    });
    return 0;
  }
  return Math.floor(parsed);
}

function parsePositiveInteger(
  rawValue: string | undefined,
  envKey: string,
  defaultValue: number,
): number {
  if (!rawValue) {
    return defaultValue;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 1) {
    logger.warn(`Invalid ${envKey}; defaulting to ${defaultValue}.`, {
      envKey,
      invalidValue: rawValue,
      fallbackBehavior: defaultValue,
    });
    return defaultValue;
  }
  return Math.floor(parsed);
}

function parseBooleanEnv(rawValue: string | undefined): boolean {
  return rawValue === "true" || rawValue === "1";
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
      logger.warn(`Invalid AI model mapping for plan "${planKey}"; disabling AI for this plan.`, {
        envKey: "AI_PLAN_MODEL_MAP_JSON",
        planKey,
        invalidValue: value,
        fallbackBehavior: "plan_disabled",
      });
      configured[planKey] = null;
      continue;
    }
    configured[planKey] = value.trim();
  }

  return Object.fromEntries(
    PLAN_KEYS.map((planKey) => [planKey, configured[planKey] ?? null]),
  ) as AiPlanModelMap;
}

function parsePlanMonthlyTokenBudgetMap(rawValue: string | undefined): AiPlanMonthlyTokenBudgetMap {
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

  return Object.fromEntries(
    PLAN_KEYS.map((planKey) => [planKey, configured[planKey] ?? 0]),
  ) as AiPlanMonthlyTokenBudgetMap;
}

function parseModalities(
  rawValue: unknown,
  envKey: string,
  fallback: readonly AiModality[] = DEFAULT_AI_ALLOWED_MODALITIES,
): readonly AiModality[] {
  const values = Array.isArray(rawValue)
    ? rawValue
    : typeof rawValue === "string"
      ? rawValue.split(",").map((value) => value.trim())
      : [];
  const parsed = values.filter(
    (value): value is AiModality =>
      typeof value === "string" && AI_MODALITIES.includes(value as AiModality),
  );
  const unique = Array.from(new Set(parsed));
  if (!unique.length) {
    if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
      logger.warn(`Invalid ${envKey}; defaulting to text-only modality.`, {
        envKey,
        invalidValue: rawValue,
        fallbackBehavior: "text_only",
      });
    }
    return [...fallback];
  }
  if (!unique.includes("text")) {
    unique.unshift("text");
  }
  return unique;
}

function parsePlanModalitiesMap(
  rawValue: string | undefined,
  fallbackModalities: readonly AiModality[],
): AiPlanModalitiesMap {
  const parsed = parseJsonObjectEnv(rawValue, "AI_PLAN_MODALITIES_MAP_JSON");
  if (!parsed) {
    return Object.fromEntries(
      PLAN_KEYS.map((planKey) => [planKey, fallbackModalities]),
    ) as AiPlanModalitiesMap;
  }

  const configured: Partial<AiPlanModalitiesMap> = {};
  for (const planKey of PLAN_KEYS) {
    configured[planKey] = parseModalities(
      parsed[planKey],
      `AI_PLAN_MODALITIES_MAP_JSON.${planKey}`,
      fallbackModalities,
    );
  }

  return Object.fromEntries(
    PLAN_KEYS.map((planKey) => [planKey, configured[planKey] ?? fallbackModalities]),
  ) as AiPlanModalitiesMap;
}

function parseAiByPlanRules(
  rawValue: string | undefined,
  fallbackModalities: readonly AiModality[],
  fallbackMaxSteps: number,
): AiByPlanRules {
  const parsed = parseJsonObjectEnv(rawValue, "AI_PLAN_RULES_JSON");
  if (!parsed) {
    return Object.fromEntries(
      AI_POLICY_PLAN_KEYS.map((planKey) => [
        planKey,
        {
          ...DEFAULT_AI_BY_PLAN_RULES[planKey],
          allowedModalities: fallbackModalities,
          maxSteps: fallbackMaxSteps,
        },
      ]),
    ) as AiByPlanRules;
  }

  const configured: Partial<AiByPlanRules> = {};
  for (const planKey of AI_POLICY_PLAN_KEYS) {
    const value = parsed[planKey];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      configured[planKey] = {
        ...DEFAULT_AI_BY_PLAN_RULES[planKey],
        allowedModalities: fallbackModalities,
        maxSteps: fallbackMaxSteps,
      };
      continue;
    }

    const maybeRule = value as {
      enabled?: unknown;
      model?: unknown;
      monthlyBudget?: unknown;
      allowedModalities?: unknown;
      maxSteps?: unknown;
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
    const allowedModalities = parseModalities(
      maybeRule.allowedModalities,
      `AI_PLAN_RULES_JSON.${planKey}.allowedModalities`,
      fallbackModalities,
    );
    const maxSteps = Math.min(
      typeof maybeRule.maxSteps === "number" &&
        Number.isFinite(maybeRule.maxSteps) &&
        maybeRule.maxSteps >= 1
        ? Math.floor(maybeRule.maxSteps)
        : fallbackMaxSteps,
      MAX_AI_STEPS_CAP,
    );

    configured[planKey] = { enabled, model, monthlyBudget, allowedModalities, maxSteps };
  }

  return Object.fromEntries(
    AI_POLICY_PLAN_KEYS.map((planKey) => [
      planKey,
      configured[planKey] ?? {
        ...DEFAULT_AI_BY_PLAN_RULES[planKey],
        allowedModalities: fallbackModalities,
        maxSteps: fallbackMaxSteps,
      },
    ]),
  ) as AiByPlanRules;
}

const AI_ACCESS_MODE = parseAiAccessMode(env.AI_ACCESS_MODE);
const AI_DEFAULT_MODEL = env.AI_DEFAULT_MODEL ?? null;
const AI_DEFAULT_MONTHLY_TOKEN_BUDGET = parseNonNegativeInteger(
  env.AI_DEFAULT_MONTHLY_TOKEN_BUDGET,
  "AI_DEFAULT_MONTHLY_TOKEN_BUDGET",
);
const AI_ALLOWED_MODALITIES = parseModalities(env.AI_ALLOWED_MODALITIES, "AI_ALLOWED_MODALITIES");
const AI_TOOLS_ENABLED = parseBooleanEnv(env.AI_TOOLS_ENABLED);
const AI_MAX_STEPS = Math.min(
  parsePositiveInteger(env.AI_MAX_STEPS, "AI_MAX_STEPS", DEFAULT_AI_MAX_STEPS),
  MAX_AI_STEPS_CAP,
);
const AI_PLAN_RULES = parseAiByPlanRules(
  env.AI_PLAN_RULES_JSON,
  AI_ALLOWED_MODALITIES,
  AI_MAX_STEPS,
);
const AI_ALLOWED_SUBSCRIPTION_STATUSES = parseAllowedSubscriptionStatuses(
  env.AI_ALLOWED_SUBSCRIPTION_STATUSES,
);
const AI_PLAN_MODEL_MAP = parsePlanModelMap(env.AI_PLAN_MODEL_MAP_JSON);
const AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP = parsePlanMonthlyTokenBudgetMap(
  env.AI_PLAN_MONTHLY_TOKEN_BUDGET_MAP_JSON,
);
const AI_PLAN_MODALITIES_MAP = parsePlanModalitiesMap(
  env.AI_PLAN_MODALITIES_MAP_JSON,
  AI_ALLOWED_MODALITIES,
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

export function getAiAllowedModalities() {
  return AI_ALLOWED_MODALITIES;
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

export function getAiAllowedModalitiesForPlan(planKey: PlanKey) {
  return AI_PLAN_MODALITIES_MAP[planKey];
}

export function getAiToolsEnabled() {
  return AI_TOOLS_ENABLED;
}

export function getAiMaxSteps() {
  return AI_MAX_STEPS;
}
