"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { CLIENT_IDEMPOTENCY_TTL_MS, SYNC_PENDING_RELOAD_DELAY_MS } from "@/lib/constants/billing";
import { clientPostJson } from "@/lib/http/client-fetch";
import { PLAN_KEYS, type PlanKey } from "@/lib/stripe/plans";
import { DashboardPageSection } from "@/components/dashboard-page-section";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Props = {
  billingEnabled: boolean;
  currentPlanKey: PlanKey | null;
  hasSubscription: boolean;
  canManageBilling: boolean;
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
}: Props) {
  const t = useTranslations("BillingActions");
  const tPlans = useTranslations("Landing.pricing");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function startCheckout(planKey: PlanKey) {
    setLoadingAction(`checkout-${planKey}`);
    setMessage(null);
    try {
      const payload = await clientPostJson<CheckoutPayload>(
        "/api/stripe/checkout",
        { planKey },
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

  const availablePlanKeys = PLAN_KEYS.filter((key) => key !== currentPlanKey);
  const showActions = billingEnabled && canManageBilling;
  const isBusy = loadingAction !== null;

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

              {availablePlanKeys.length > 0 ? (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium text-foreground">
                        {t("changePlan.title")}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {t("changePlan.subtitle")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {availablePlanKeys.map((key) => (
                        <Button
                          key={key}
                          type="button"
                          variant="outline"
                          size="control"
                          onClick={() => changePlan(key)}
                          disabled={isBusy}
                        >
                          {loadingAction === `change-${key}` ? (
                            <>
                              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                              {t("actions.updating")}
                            </>
                          ) : (
                            t("actions.switchTo", { name: tPlans(`plans.${key}.name`) })
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("subscribe.hint")}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {PLAN_KEYS.map((key) => (
                  <Button
                    key={key}
                    type="button"
                    variant="default"
                    className="h-auto w-full flex-col gap-1 py-3"
                    onClick={() => startCheckout(key)}
                    disabled={isBusy}
                  >
                    {loadingAction === `checkout-${key}` ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        <span className="text-xs font-normal opacity-90">
                          {t("actions.opening")}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-semibold">{tPlans(`plans.${key}.name`)}</span>
                        <span className="text-xs font-normal opacity-90">
                          {t("actions.subscribePlan")}
                        </span>
                      </>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}

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
