"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { CLIENT_IDEMPOTENCY_TTL_MS, SYNC_PENDING_RELOAD_DELAY_MS } from "@/lib/constants/billing";
import { clientPostJson } from "@/lib/http/client-fetch";
import { type PlanKey, type PlanInterval, type PublicPricingPlan } from "@/lib/stripe/plans";
import { DashboardPageSection } from "@/components/dashboard-page-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type Props = {
  billingEnabled: boolean;
  currentPlanKey: PlanKey | null;
  hasSubscription: boolean;
  canManageBilling: boolean;
  plans: PublicPricingPlan[];
  showAnnualToggle: boolean;
  currentBillingInterval: PlanInterval | null;
};

type CheckoutPayload = {
  url?: string;
  syncPending?: boolean;
  warning?: string;
  planChanged?: boolean;
};

function createIdempotencyToken(action: "checkout" | "change-plan", planKey: PlanKey) {
  const storageKey = `${action}-idempotency:${planKey}`;
  const now = Date.now();
  const ttlMs = CLIENT_IDEMPOTENCY_TTL_MS;

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
    // Ignore storage parse/access errors and fall back to fresh token.
  }

  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}-${now.toString(36)}`;
  const token = `${action}-${planKey}-${randomPart}`;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify({ token, expiresAt: now + ttlMs }));
  } catch {
    // Ignore storage errors.
  }

  return token;
}

export function BillingActions({
  billingEnabled,
  currentPlanKey,
  hasSubscription,
  canManageBilling,
  plans,
  showAnnualToggle,
  currentBillingInterval,
}: Props) {
  const t = useTranslations("BillingActions");
  const tPlans = useTranslations("Landing.pricing");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<"month" | "year">(
    currentBillingInterval ?? "month",
  );

  async function startCheckout(planKey: PlanKey) {
    setLoadingAction(`checkout-${planKey}`);
    setMessage(null);
    try {
      const payload = await clientPostJson<CheckoutPayload>(
        "/api/stripe/checkout",
        { planKey, interval: selectedInterval },
        {
          fallbackErrorMessage: t("errors.requestFailed"),
          headers: {
            "x-idempotency-key": createIdempotencyToken("checkout", planKey),
          },
        },
      );
      if (!payload.url) throw new Error(t("errors.missingCheckoutUrl"));
      const opened = window.open(payload.url, "_blank", "noopener,noreferrer");
      if (!opened) {
        window.location.assign(payload.url);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.checkoutFailed"));
    } finally {
      setLoadingAction(null);
    }
  }

  async function changePlan(planKey: PlanKey) {
    setLoadingAction(`change-${planKey}`);
    setMessage(null);
    let waitForSyncRefresh = false;
    try {
      const payload = await clientPostJson<CheckoutPayload>(
        "/api/stripe/change-plan",
        { planKey },
        {
          fallbackErrorMessage: t("errors.requestFailed"),
          headers: {
            "x-idempotency-key": createIdempotencyToken("change-plan", planKey),
          },
        },
      );
      if (payload.syncPending) {
        waitForSyncRefresh = true;
        setLoadingAction("sync-pending");
        setMessage(t("messages.syncPending"));
        window.setTimeout(() => {
          window.location.reload();
        }, SYNC_PENDING_RELOAD_DELAY_MS);
        return;
      }

      if (payload.warning) {
        if (payload.planChanged) {
          waitForSyncRefresh = true;
          setLoadingAction("sync-pending");
          window.setTimeout(() => {
            window.location.reload();
          }, SYNC_PENDING_RELOAD_DELAY_MS);
        }
        setMessage(payload.warning);
        return;
      }

      setMessage(t("messages.planUpdated"));
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.planChangeFailed"));
    } finally {
      if (!waitForSyncRefresh) {
        setLoadingAction(null);
      }
    }
  }

  async function openPortal() {
    setLoadingAction("portal");
    setMessage(null);
    try {
      const payload = await clientPostJson<CheckoutPayload>(
        "/api/stripe/portal",
        {},
        {
          fallbackErrorMessage: t("errors.requestFailed"),
        },
      );
      if (!payload.url) throw new Error(t("errors.missingPortalUrl"));
      const opened = window.open(payload.url, "_blank", "noopener,noreferrer");
      if (!opened) {
        window.location.assign(payload.url);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.portalUnavailable"));
    } finally {
      setLoadingAction(null);
    }
  }

  const showActions = billingEnabled && canManageBilling;
  const isBusy = loadingAction !== null;
  const isAnnual = selectedInterval === "year";

  const description = !billingEnabled
    ? t("description.billingDisabled")
    : !canManageBilling
      ? t("description.noPermission")
      : hasSubscription
        ? t("description.hasSubscription")
        : t("description.noSubscription");

  return (
    <DashboardPageSection icon={Wallet} title={t("title")} description={description}>
      {showActions ? (
        <div className="space-y-8">
          {hasSubscription ? (
            <>
              <div className="rounded-lg border border-border bg-muted/40 p-4 sm:p-5 dark:bg-muted/25">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-medium text-foreground">{t("portal.cardTitle")}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {t("portal.cardSubtitle")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="default"
                    size="control"
                    className="w-full shrink-0 sm:w-auto"
                    onClick={openPortal}
                    disabled={isBusy}
                    aria-label={t("portal.ctaAria")}
                  >
                    {loadingAction === "portal" ? (
                      <>
                        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                        {t("actions.opening")}
                      </>
                    ) : (
                      <>
                        <ExternalLink className="size-4 shrink-0 opacity-90" aria-hidden />
                        {t("portal.cta")}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <Separator />
            </>
          ) : null}

          {/* Plan comparison section */}
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">
                {hasSubscription ? t("changePlan.title") : t("subscribe.hint")}
              </h3>
              {hasSubscription ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("changePlan.subtitle")}
                </p>
              ) : null}
            </div>

            {showAnnualToggle ? (
              <div className="flex items-center gap-3">
                <SegmentedControl
                  aria-label={`${t("toggle.monthly")} / ${t("toggle.annual")}`}
                  value={selectedInterval}
                  onValueChange={setSelectedInterval}
                  options={[
                    { value: "month" as const, label: t("toggle.monthly") },
                    { value: "year" as const, label: t("toggle.annual") },
                  ]}
                />
                {isAnnual ? (
                  <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
                    {t("toggle.save")}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const isCurrent = plan.key === currentPlanKey;
                const priceLabel =
                  isAnnual && plan.annualPriceLabel ? plan.annualPriceLabel : plan.priceLabel;

                return (
                  <div
                    key={plan.key}
                    className={cn(
                      "relative flex flex-col rounded-xl p-6 transition-shadow",
                      isCurrent
                        ? "bg-primary/5 ring-2 ring-primary"
                        : plan.popular
                          ? "bg-card ring-2 ring-primary/50 hover:shadow-md"
                          : "bg-muted/30 ring-1 ring-border hover:shadow-md",
                    )}
                  >
                    {isCurrent ? (
                      <div className="absolute -top-2.5 right-4">
                        <Badge variant="default" className="shadow-sm">
                          {t("currentPlanBadge")}
                        </Badge>
                      </div>
                    ) : plan.popular && !hasSubscription ? (
                      <div className="absolute -top-2.5 right-4">
                        <Badge variant="default" className="shadow-sm">
                          {tPlans("mostPopular")}
                        </Badge>
                      </div>
                    ) : null}

                    <p className="text-lg font-semibold text-foreground">
                      {tPlans(`plans.${plan.key}.name`)}
                    </p>

                    <div className="mt-3 flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold tracking-tight text-foreground">
                        {priceLabel}
                      </span>
                      {isAnnual && plan.annualPriceLabel ? (
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                          {t("toggle.save")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{t("perSeat")}</p>

                    <p className="mt-3 text-sm text-muted-foreground">
                      {tPlans(`plans.${plan.key}.description`)}
                    </p>

                    <ul className="mt-4 flex-1 space-y-2.5 border-t border-border pt-4">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {isCurrent ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="cta"
                        disabled
                        className="mt-6 w-full"
                      >
                        {t("currentPlanBadge")}
                      </Button>
                    ) : hasSubscription ? (
                      <Button
                        type="button"
                        variant={plan.popular ? "default" : "outline"}
                        size="cta"
                        onClick={() => changePlan(plan.key as PlanKey)}
                        disabled={isBusy}
                        className="mt-6 w-full"
                      >
                        {loadingAction === `change-${plan.key}` ? (
                          <>
                            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                            {t("actions.updating")}
                          </>
                        ) : (
                          t("actions.switchTo", { name: tPlans(`plans.${plan.key}.name`) })
                        )}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant={plan.popular ? "default" : "outline"}
                        size="cta"
                        onClick={() => startCheckout(plan.key as PlanKey)}
                        disabled={isBusy}
                        className="mt-6 w-full"
                      >
                        {loadingAction === `checkout-${plan.key}` ? (
                          <>
                            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                            {t("actions.opening")}
                          </>
                        ) : (
                          t("actions.getStarted")
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {hasSubscription && showAnnualToggle ? (
              <p className="text-xs text-muted-foreground">{t("intervalNote")}</p>
            ) : null}
          </div>

          {message ? (
            <div
              className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
              role="status"
            >
              {loadingAction === "sync-pending" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  {message}
                </span>
              ) : (
                message
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </DashboardPageSection>
  );
}
