import { type EffectivePlanKey } from "@/lib/billing/effective-plan";
import {
  getAiAccessMode,
  getAiAllowedModalities,
  getAiAllowedModalitiesForPlan,
  getAiDefaultModel,
  getAiDefaultMonthlyTokenBudget,
  getAiMaxSteps,
  getAiModelForPlan,
  getAiMonthlyTokenBudgetForPlan,
  getAiRuleForPlan,
} from "@/lib/ai/config";
import { type AiModality } from "@/lib/ai/config";

export type AiAccessResolution = {
  allowed: boolean;
  model: string | null;
  monthlyTokenBudget: number;
  allowedModalities: readonly AiModality[];
  maxSteps: number;
  denialReason?: string;
};

export function resolveAiAccess({
  effectivePlanKey,
}: {
  effectivePlanKey: EffectivePlanKey | null;
}): AiAccessResolution {
  const mode = getAiAccessMode();
  const allowedModalities = getAiAllowedModalities();
  const maxSteps = getAiMaxSteps();
  if (mode === "all") {
    const model = getAiDefaultModel();
    if (!model) {
      return {
        allowed: false,
        model: null,
        monthlyTokenBudget: 0,
        allowedModalities,
        maxSteps,
        denialReason: "default_model_missing",
      };
    }
    return {
      allowed: true,
      model,
      monthlyTokenBudget: getAiDefaultMonthlyTokenBudget(),
      allowedModalities,
      maxSteps,
    };
  }

  if (mode === "by_plan") {
    if (!effectivePlanKey) {
      return {
        allowed: false,
        model: null,
        monthlyTokenBudget: 0,
        allowedModalities,
        maxSteps,
        denialReason: "plan_not_allowed",
      };
    }
    const rule = getAiRuleForPlan(effectivePlanKey);
    if (!rule.enabled) {
      return {
        allowed: false,
        model: null,
        monthlyTokenBudget: 0,
        allowedModalities: rule.allowedModalities,
        maxSteps: rule.maxSteps,
        denialReason: "plan_disabled",
      };
    }
    if (!rule.model) {
      return {
        allowed: false,
        model: null,
        monthlyTokenBudget: 0,
        allowedModalities: rule.allowedModalities,
        maxSteps: rule.maxSteps,
        denialReason: "plan_model_missing",
      };
    }
    return {
      allowed: true,
      model: rule.model,
      monthlyTokenBudget: rule.monthlyBudget,
      allowedModalities: rule.allowedModalities,
      maxSteps: rule.maxSteps,
    };
  }

  if (!effectivePlanKey || effectivePlanKey === "free") {
    return {
      allowed: false,
      model: null,
      monthlyTokenBudget: 0,
      allowedModalities,
      maxSteps,
      denialReason: "plan_not_allowed",
    };
  }
  const model = getAiModelForPlan(effectivePlanKey);
  if (!model) {
    return {
      allowed: false,
      model: null,
      monthlyTokenBudget: 0,
      allowedModalities: getAiAllowedModalitiesForPlan(effectivePlanKey),
      maxSteps,
      denialReason: "plan_not_allowed",
    };
  }
  return {
    allowed: true,
    model,
    monthlyTokenBudget: getAiMonthlyTokenBudgetForPlan(effectivePlanKey),
    allowedModalities: getAiAllowedModalitiesForPlan(effectivePlanKey),
    maxSteps,
  };
}
