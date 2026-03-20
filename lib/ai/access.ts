import { type EffectivePlanKey } from "@/lib/billing/effective-plan";
import {
  getAiAccessMode,
  getAiDefaultModel,
  getAiDefaultMonthlyTokenBudget,
  getAiModelForPlan,
  getAiMonthlyTokenBudgetForPlan,
  getAiRuleForPlan,
} from "@/lib/ai/config";

export type AiAccessResolution = {
  allowed: boolean;
  model: string | null;
  monthlyTokenBudget: number;
  denialReason?: string;
};

export function resolveAiAccess({
  effectivePlanKey,
}: {
  effectivePlanKey: EffectivePlanKey | null;
}): AiAccessResolution {
  const mode = getAiAccessMode();
  if (mode === "all") {
    const model = getAiDefaultModel();
    if (!model) {
      return { allowed: false, model: null, monthlyTokenBudget: 0, denialReason: "default_model_missing" };
    }
    return {
      allowed: true,
      model,
      monthlyTokenBudget: getAiDefaultMonthlyTokenBudget(),
    };
  }

  if (mode === "by_plan") {
    if (!effectivePlanKey) {
      return { allowed: false, model: null, monthlyTokenBudget: 0, denialReason: "plan_not_allowed" };
    }
    const rule = getAiRuleForPlan(effectivePlanKey);
    if (!rule.enabled) {
      return { allowed: false, model: null, monthlyTokenBudget: 0, denialReason: "plan_disabled" };
    }
    if (!rule.model) {
      return { allowed: false, model: null, monthlyTokenBudget: 0, denialReason: "plan_model_missing" };
    }
    return {
      allowed: true,
      model: rule.model,
      monthlyTokenBudget: rule.monthlyBudget,
    };
  }

  if (!effectivePlanKey || effectivePlanKey === "free") {
    return { allowed: false, model: null, monthlyTokenBudget: 0, denialReason: "plan_not_allowed" };
  }
  const model = getAiModelForPlan(effectivePlanKey);
  if (!model) {
    return { allowed: false, model: null, monthlyTokenBudget: 0, denialReason: "plan_not_allowed" };
  }
  return {
    allowed: true,
    model,
    monthlyTokenBudget: getAiMonthlyTokenBudgetForPlan(effectivePlanKey),
  };
}
