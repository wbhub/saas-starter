"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { Button } from "@/components/ui/button";
import type { PlanInterval, PlanKey } from "@/lib/stripe/plans";

type PlanData = {
  key: PlanKey;
  name: string;
  amountMonthly: number;
  amountAnnualMonthly?: number;
  description: string;
  popular: boolean;
  features: string[];
  hasPriceId: boolean;
  hasAnnualPriceId: boolean;
};

type Props = {
  plans: PlanData[];
  freePlanEnabled: boolean;
  freePlanFeatures: string[];
  showAnnualToggle: boolean;
  isAuthenticated: boolean;
  initialInterval: PlanInterval;
  autoStartPlanKey: PlanKey | null;
  autoCompleteFreePlan: boolean;
};

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function createIdempotencyToken(planKey: string) {
  const storageKey = `onboarding-checkout:${planKey}`;
  const now = Date.now();
  const ttlMs = 10 * 60 * 1000;

  try {
    const existingRaw = window.sessionStorage.getItem(storageKey);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as {
        token?: string;
        expiresAt?: number;
      };
      if (
        typeof existing.token === "string" &&
        typeof existing.expiresAt === "number" &&
        existing.expiresAt > now
      ) {
        return existing.token;
      }
    }
  } catch {
    // Ignore storage errors.
  }

  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}-${now.toString(36)}`;
  const token = `onboarding-${planKey}-${randomPart}`;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify({ token, expiresAt: now + ttlMs }));
  } catch {
    // Ignore storage errors.
  }

  return token;
}

export function OnboardingPlanSelector({
  plans,
  freePlanEnabled,
  freePlanFeatures,
  showAnnualToggle,
  isAuthenticated,
  initialInterval,
  autoStartPlanKey,
  autoCompleteFreePlan,
}: Props) {
  const t = useTranslations("Onboarding");
  const router = useRouter();
  const [interval, setInterval] = useState<"month" | "year">(initialInterval);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoStartedAction = useRef<string | null>(null);

  const isAnnual = interval === "year";

  function redirectToSignup(plan: string) {
    const params = new URLSearchParams({ plan });
    if (isAnnual) params.set("interval", "year");
    router.push(`/signup?${params.toString()}`);
  }

  async function handleFreePlan() {
    if (!isAuthenticated) {
      redirectToSignup("free");
      return;
    }
    setLoadingAction("free");
    setError(null);
    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getCsrfHeaders(),
        },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? t("errors.completeFailed"));
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.completeFailed"));
    } finally {
      setLoadingAction(null);
    }
  }

  async function handlePaidPlan(planKey: PlanKey) {
    if (!isAuthenticated) {
      redirectToSignup(planKey);
      return;
    }
    setLoadingAction(planKey);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getCsrfHeaders(),
          "x-idempotency-key": createIdempotencyToken(planKey),
        },
        body: JSON.stringify({
          planKey,
          interval,
          source: "onboarding",
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? t("errors.checkoutFailed"));
      }
      const data = (await response.json()) as { url?: string };
      if (!data.url) throw new Error(t("errors.missingCheckoutUrl"));
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.checkoutFailed"));
      setLoadingAction(null);
    }
  }

  const autoStartCheckout = useEffectEvent((planKey: PlanKey) => {
    void handlePaidPlan(planKey);
  });
  const autoCompleteFree = useEffectEvent(() => {
    void handleFreePlan();
  });

  useEffect(() => {
    if (!isAuthenticated || !autoStartPlanKey) {
      return;
    }

    const autoStartKey = `checkout:${autoStartPlanKey}:${initialInterval}`;
    if (autoStartedAction.current === autoStartKey) {
      return;
    }

    autoStartedAction.current = autoStartKey;
    autoStartCheckout(autoStartPlanKey);
  }, [autoStartPlanKey, initialInterval, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !autoCompleteFreePlan) {
      return;
    }

    const autoCompleteKey = "free";
    if (autoStartedAction.current === autoCompleteKey) {
      return;
    }

    autoStartedAction.current = autoCompleteKey;
    autoCompleteFree();
  }, [autoCompleteFreePlan, isAuthenticated]);

  const gridCols = freePlanEnabled ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3";

  return (
    <div className="mt-10 space-y-8">
      {/* Monthly / Annual toggle */}
      {showAnnualToggle ? (
        <div className="flex items-center justify-center gap-3">
          <div className="inline-flex items-center rounded-lg border app-border-subtle p-1">
            <button
              type="button"
              onClick={() => setInterval("month")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                !isAnnual
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("toggle.monthly")}
            </button>
            <button
              type="button"
              onClick={() => setInterval("year")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                isAnnual
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("toggle.annual")}
            </button>
          </div>
          {isAnnual ? (
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {t("toggle.save")}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Plan cards */}
      <div className={`grid gap-4 ${gridCols}`}>
        {/* Free plan card */}
        {freePlanEnabled ? (
          <div className="relative flex flex-col rounded-xl bg-card ring-1 ring-border p-6">
            <p className="text-lg font-semibold text-foreground">{t("freePlan.name")}</p>
            <div className="mt-4">
              <span className="text-4xl font-bold tracking-tight text-foreground">
                {t("freePlan.price")}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t("freePlan.priceDescription")}</p>
            <p className="mt-4 text-sm font-medium text-muted-foreground">
              {t("freePlan.description")}
            </p>
            <ul className="mt-4 space-y-2.5 flex-1">
              {freePlanFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="text-muted-foreground">{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="secondary"
              size="cta"
              onClick={handleFreePlan}
              disabled={loadingAction !== null}
              className="mt-6 w-full"
            >
              {loadingAction === "free" ? t("loading") : t("freePlan.cta")}
            </Button>
          </div>
        ) : null}

        {/* Paid plan cards */}
        {plans.map((plan) => {
          const price =
            isAnnual && plan.amountAnnualMonthly ? plan.amountAnnualMonthly : plan.amountMonthly;
          const canCheckout = isAuthenticated
            ? isAnnual
              ? plan.hasAnnualPriceId
              : plan.hasPriceId
            : true;

          return (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-xl bg-card p-6 ${
                plan.popular ? "ring-2 ring-primary" : "ring-1 ring-border"
              }`}
            >
              {plan.popular ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                  Most popular
                </span>
              ) : null}
              <p className="text-lg font-semibold text-foreground">{plan.name}</p>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-4xl font-bold tracking-tight text-foreground">
                  {formatUsd(price)}
                </span>
                {isAnnual && plan.amountAnnualMonthly ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {t("toggle.save")}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {isAnnual
                  ? t("paidPlan.priceDescriptionAnnual")
                  : t("paidPlan.priceDescriptionMonthly")}
              </p>
              <p className="mt-4 text-sm font-medium text-muted-foreground">{plan.description}</p>
              <ul className="mt-4 space-y-2.5 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant={plan.popular ? "default" : "outline"}
                size="cta"
                onClick={() => handlePaidPlan(plan.key)}
                disabled={loadingAction !== null || !canCheckout}
                className="mt-6 w-full"
              >
                {loadingAction === plan.key ? t("loading") : t("paidPlan.cta", { name: plan.name })}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
