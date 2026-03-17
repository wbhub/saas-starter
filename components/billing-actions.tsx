"use client";

import { useState } from "react";
import { PLAN_KEYS, PLAN_LABELS } from "@/lib/stripe/plans";
import { getStripe } from "@/lib/stripe/client";

type Props = {
  currentPlanKey: string | null;
  hasSubscription: boolean;
};

async function postJson(path: string, body: Record<string, string>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? "Request failed");
  }

  return (await response.json()) as {
    url?: string;
    ok?: boolean;
  };
}

export function BillingActions({ currentPlanKey, hasSubscription }: Props) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function startCheckout(planKey: string) {
    setLoadingAction(`checkout-${planKey}`);
    setMessage(null);
    try {
      const payload = await postJson("/api/stripe/checkout", { planKey });
      if (!payload.url) throw new Error("Missing checkout URL");
      const stripe = await getStripe();
      if (!stripe) throw new Error("Stripe could not be initialized");
      window.location.assign(payload.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setLoadingAction(null);
    }
  }

  async function changePlan(planKey: string) {
    setLoadingAction(`change-${planKey}`);
    setMessage(null);
    try {
      await postJson("/api/stripe/change-plan", { planKey });
      setMessage("Plan updated. Refreshing billing details...");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Plan change failed");
    } finally {
      setLoadingAction(null);
    }
  }

  async function openPortal() {
    setLoadingAction("portal");
    setMessage(null);
    try {
      const payload = await postJson("/api/stripe/portal", {});
      if (!payload.url) throw new Error("Missing portal URL");
      window.location.assign(payload.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Portal unavailable");
    } finally {
      setLoadingAction(null);
    }
  }

  const availablePlanKeys = PLAN_KEYS.filter((key) => key !== currentPlanKey);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-slate-900">Billing actions</h3>
      <p className="text-sm text-slate-600">
        {hasSubscription
          ? "Upgrade, downgrade, or open Stripe Billing Portal."
          : "Choose a plan to start your subscription."}
      </p>

      <div className="flex flex-wrap gap-2">
        {!hasSubscription
          ? PLAN_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => startCheckout(key)}
                disabled={loadingAction !== null}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {loadingAction === `checkout-${key}`
                  ? "Opening..."
                  : `Subscribe ${PLAN_LABELS[key]}`}
              </button>
            ))
          : availablePlanKeys.map((key) => (
              <button
                key={key}
                onClick={() => changePlan(key)}
                disabled={loadingAction !== null}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                {loadingAction === `change-${key}`
                  ? "Updating..."
                  : `Switch to ${PLAN_LABELS[key]}`}
              </button>
            ))}

        {hasSubscription ? (
          <button
            onClick={openPortal}
            disabled={loadingAction !== null}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loadingAction === "portal" ? "Opening..." : "Manage billing"}
          </button>
        ) : null}
      </div>

      {message ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {message}
        </p>
      ) : null}
    </div>
  );
}
