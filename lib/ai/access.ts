import { type EffectivePlanKey } from "@/lib/billing/effective-plan";
import {
  getAiAccessMode,
  getAiAllowedModalities,
  getAiAllowedModalitiesForPlan,
  getAiDefaultModel,
  getAiDefaultMonthlyTokenBudget,
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
  denialReason?: string;
};

export function resolveAiAccess({
  effectivePlanKey,
}: {
  effectivePlanKey: EffectivePlanKey | null;
}): AiAccessResolution {
  const mode = getAiAccessMode();
  const allowedModalities = getAiAllowedModalities();
  if (mode === "all") {
    const model = getAiDefaultModel();
    if (!model) {
      return {
        allowed: false,
        model: null,
        monthlyTokenBudget: 0,
        allowedModalities,
        denialReason: "default_model_missing",
      };
    }
    return {
      allowed: true,
      model,
      monthlyTokenBudget: getAiDefaultMonthlyTokenBudget(),
      allowedModalities,
    };
  }

  if (mode === "by_plan") {
    if (!effectivePlanKey) {
      return {
        allowed: false,
        model: null,
        monthlyTokenBudget: 0,
        allowedModalities,
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
        denialReason: "plan_disabled",
      };
    }
    if (!rule.model) {
      return {
        allowed: false,
        model: null,
        monthlyTokenBudget: 0,
        allowedModalities: rule.allowedModalities,
        denialReason: "plan_model_missing",
      };
    }
    return {
      allowed: true,
      model: rule.model,
      monthlyTokenBudget: rule.monthlyBudget,
      allowedModalities: rule.allowedModalities,
    };
  }

  if (!effectivePlanKey || effectivePlanKey === "free") {
    return {
      allowed: false,
      model: null,
      monthlyTokenBudget: 0,
      allowedModalities,
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
      denialReason: "plan_not_allowed",
    };
  }
  return {
    allowed: true,
    model,
    monthlyTokenBudget: getAiMonthlyTokenBudgetForPlan(effectivePlanKey),
    allowedModalities: getAiAllowedModalitiesForPlan(effectivePlanKey),
  };
}
