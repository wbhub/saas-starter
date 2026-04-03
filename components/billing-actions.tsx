"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { CLIENT_IDEMPOTENCY_TTL_MS, SYNC_PENDING_RELOAD_DELAY_MS } from "@/lib/constants/billing";
import { clientPostJson } from "@/lib/http/client-fetch";
import { type PlanKey, type PlanInterval, type PublicPricingPlan } from "@/lib/stripe/plans";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

type ProrationPreview = {
  amountDue: number;
  currency: string;
  isCredit: boolean;
  targetPlanName: string;
};

type PendingChange = {
  planKey: PlanKey;
  planName: string;
  preview: ProrationPreview | null;
  loading: boolean;
  error: string | null;
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

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
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
  const router = useRouter();
  const t = useTranslations("BillingActions");
  const tPlans = useTranslations("Landing.pricing");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<"month" | "year">(
    currentBillingInterval ?? "month",
  );
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);

  async function requestPlanChange(planKey: PlanKey, planName: string) {
    setPendingChange({ planKey, planName, preview: null, loading: true, error: null });
    try {
      const preview = await clientPostJson<ProrationPreview>(
        "/api/stripe/preview-proration",
        { planKey },
        { fallbackErrorMessage: t("errors.requestFailed") },
      );
      setPendingChange({ planKey, planName, preview, loading: false, error: null });
    } catch (error) {
      setPendingChange({
        planKey,
        planName,
        preview: null,
        loading: false,
        error: error instanceof Error ? error.message : t("errors.previewFailed"),
      });
    }
  }

  async function confirmPlanChange() {
    if (!pendingChange) return;
    const { planKey } = pendingChange;
    setPendingChange(null);
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
          router.refresh();
        }, SYNC_PENDING_RELOAD_DELAY_MS);
        return;
      }

      if (payload.warning) {
        if (payload.planChanged) {
          waitForSyncRefresh = true;
          setLoadingAction("sync-pending");
          window.setTimeout(() => {
            router.refresh();
          }, SYNC_PENDING_RELOAD_DELAY_MS);
        }
        setMessage(payload.warning);
        return;
      }

      setMessage(t("messages.planUpdated"));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("errors.planChangeFailed"));
    } finally {
      if (!waitForSyncRefresh) {
        setLoadingAction(null);
      }
    }
  }

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
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <h3 className="text-sm font-medium text-foreground">
                  {hasSubscription ? t("changePlan.title") : t("subscribe.hint")}
                </h3>
                {hasSubscription ? (
                  <p className="text-sm text-muted-foreground">{t("changePlan.subtitle")}</p>
                ) : null}
              </div>

              {showAnnualToggle ? (
                <div className="flex items-center gap-2">
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
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                      {t("toggle.save")}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const isCurrent = plan.key === currentPlanKey;
                const priceLabel =
                  isAnnual && plan.annualPriceLabel ? plan.annualPriceLabel : plan.priceLabel;
                const isLoading =
                  loadingAction === `change-${plan.key}` ||
                  loadingAction === `checkout-${plan.key}`;

                // Determine if this plan is an upgrade relative to the current plan.
                // Downgrades should use a muted button style, never a blue CTA.
                const currentPlanAmount = currentPlanKey
                  ? (plans.find((p) => p.key === currentPlanKey)?.amountMonthly ?? 0)
                  : 0;
                const isUpgrade = plan.amountMonthly > currentPlanAmount;

                return (
                  <div
                    key={plan.key}
                    className={cn(
                      "relative flex flex-col rounded-lg p-4 transition-shadow",
                      isCurrent
                        ? "bg-primary/5 ring-2 ring-primary"
                        : "bg-muted/30 ring-1 ring-border hover:shadow-sm",
                    )}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {tPlans(`plans.${plan.key}.name`)}
                        </p>
                        {isCurrent ? (
                          <Badge variant="outline" className="text-xs">
                            {t("currentPlanBadge")}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-xl font-bold tracking-tight text-foreground">
                          {priceLabel}
                        </span>
                        {isAnnual && plan.annualPriceLabel ? (
                          <span className="rounded-full bg-success/10 px-1.5 py-px text-[10px] font-medium text-success">
                            {t("toggle.save")}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">{t("perSeat")}</p>
                    </div>

                    <ul className="mt-3 flex-1 space-y-1.5 border-t border-border pt-3">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-1.5 text-xs">
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {isCurrent ? null : hasSubscription ? (
                      <Button
                        type="button"
                        variant={isUpgrade ? "default" : "outline"}
                        size="sm"
                        onClick={() =>
                          requestPlanChange(plan.key as PlanKey, tPlans(`plans.${plan.key}.name`))
                        }
                        disabled={isBusy}
                        className="mt-3 w-full"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
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
                        size="sm"
                        onClick={() => startCheckout(plan.key as PlanKey)}
                        disabled={isBusy}
                        className="mt-3 w-full"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
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

      {/* Plan change confirmation dialog */}
      <AlertDialog
        open={pendingChange !== null}
        onOpenChange={(open) => {
          if (!open) setPendingChange(null);
        }}
      >
        <AlertDialogContent size="lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingChange
                ? t("confirm.title", { name: pendingChange.planName })
                : t("confirm.title", { name: "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingChange?.loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {t("confirm.loading")}
                </span>
              ) : pendingChange?.error ? (
                <span>
                  {t("confirm.errorPrefix")} {pendingChange.error}
                </span>
              ) : pendingChange?.preview ? (
                <span className="flex flex-col gap-2">
                  {pendingChange.preview.isCredit ? (
                    <span>
                      {t("confirm.credit", {
                        amount: formatCurrency(
                          pendingChange.preview.amountDue,
                          pendingChange.preview.currency,
                        ),
                      })}
                    </span>
                  ) : pendingChange.preview.amountDue === 0 ? (
                    <span>{t("confirm.noCharge")}</span>
                  ) : (
                    <span>
                      {t("confirm.charge", {
                        amount: formatCurrency(
                          pendingChange.preview.amountDue,
                          pendingChange.preview.currency,
                        ),
                      })}
                    </span>
                  )}
                  <span>{t("confirm.proration")}</span>
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmPlanChange}
              disabled={pendingChange?.loading || !!pendingChange?.error}
            >
              {t("confirm.action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardPageSection>
  );
}
