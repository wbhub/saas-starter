"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CLIENT_IDEMPOTENCY_TTL_MS, SYNC_PENDING_RELOAD_DELAY_MS } from "@/lib/constants/billing";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { PLAN_KEYS, type PlanKey } from "@/lib/stripe/plans";

type Props = {
  billingEnabled: boolean;
  currentPlanKey: PlanKey | null;
  hasSubscription: boolean;
  canManageBilling: boolean;
};

type PostJsonOptions = {
  headers?: HeadersInit;
  fallbackErrorMessage?: string;
};

async function postJson(path: string, body: Record<string, string>, options?: PostJsonOptions) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getCsrfHeaders(),
      ...options?.headers,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? options?.fallbackErrorMessage ?? "Request failed");
  }

  return (await response.json()) as {
    url?: string;
    ok?: boolean;
    syncPending?: boolean;
  };
}

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
      const payload = await postJson(
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
      const payload = await postJson(
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
      const payload = await postJson(
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

  return (
    <div className="space-y-4 rounded-xl border app-border-subtle app-surface p-5">
      <h3 className="text-lg font-semibold text-foreground">{t("title")}</h3>
      <p className="text-sm text-muted-foreground">
        {!billingEnabled
          ? t("description.billingDisabled")
          : !canManageBilling
            ? t("description.noPermission")
            : hasSubscription
              ? t("description.hasSubscription")
              : t("description.noSubscription")}
      </p>

      <div className="flex flex-wrap gap-2">
        {!billingEnabled || !canManageBilling
          ? null
          : !hasSubscription
            ? PLAN_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => startCheckout(key)}
                  disabled={loadingAction !== null}
                  className="rounded-lg bg-btn-accent px-4 py-2 text-sm font-medium text-white hover:bg-btn-accent-hover disabled:opacity-60"
                >
                  {loadingAction === `checkout-${key}`
                    ? t("actions.opening")
                    : t("actions.subscribe", { name: tPlans(`plans.${key}.name`) })}
                </button>
              ))
            : availablePlanKeys.map((key) => (
                <button
                  key={key}
                  onClick={() => changePlan(key)}
                  disabled={loadingAction !== null}
                  className="rounded-lg border app-border-subtle px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-hover disabled:opacity-60"
                >
                  {loadingAction === `change-${key}`
                    ? t("actions.updating")
                    : t("actions.switchTo", { name: tPlans(`plans.${key}.name`) })}
                </button>
              ))}

        {billingEnabled && canManageBilling && hasSubscription ? (
          <button
            onClick={openPortal}
            disabled={loadingAction !== null}
            className="rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-text hover:bg-btn-primary-hover disabled:opacity-60"
          >
            {loadingAction === "portal" ? t("actions.opening") : t("actions.manageBilling")}
          </button>
        ) : null}
      </div>

      {message ? (
        <p className="rounded-lg app-surface-subtle px-3 py-2 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      {!billingEnabled ? (
        <p className="rounded-lg app-surface-subtle px-3 py-2 text-sm text-muted-foreground">
          {t("messages.billingDisabled")}
        </p>
      ) : null}
    </div>
  );
}
