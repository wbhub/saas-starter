// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingPlanSelector } from "./plan-selector";

const push = vi.fn();
const refresh = vi.fn();
const originalLocation = window.location;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/http/csrf", () => ({
  getCsrfHeaders: () => ({
    "x-csrf-token": "csrf-token",
  }),
}));

// clientFetch (used by clientPostJson) re-exports getCsrfHeaders internally,
// so we mock the underlying module rather than the wrapper.
vi.mock("@/lib/http/client-fetch", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/http/client-fetch")>("@/lib/http/client-fetch");
  return actual;
});

const baseProps: ComponentProps<typeof OnboardingPlanSelector> = {
  plans: [
    {
      key: "starter",
      name: "Starter",
      amountMonthly: 25,
      description: "Starter plan",
      popular: false,
      features: ["Feature A"],
      hasPriceId: true,
      hasAnnualPriceId: true,
    },
  ],
  freePlanEnabled: true,
  freePlanFeatures: ["Free feature"],
  showAnnualToggle: true,
  isAuthenticated: true,
  initialInterval: "year",
  autoStartPlanKey: null,
  autoCompleteFreePlan: false,
};

describe("OnboardingPlanSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("auto-starts checkout through the guarded POST route for a selected paid plan", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        assign,
      },
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.stripe.test/session" }),
    } as Response);

    render(<OnboardingPlanSelector {...baseProps} autoStartPlanKey="starter" />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/stripe/checkout",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-csrf-token": "csrf-token",
            "x-idempotency-key": expect.any(String),
          }),
          body: JSON.stringify({
            planKey: "starter",
            interval: "year",
            source: "onboarding",
          }),
        }),
      );
    });

    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/session");
  });

  it("auto-completes onboarding for a selected free plan through the POST route", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    render(<OnboardingPlanSelector {...baseProps} autoCompleteFreePlan />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/onboarding/complete",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-csrf-token": "csrf-token",
          }),
        }),
      );
    });

    expect(push).toHaveBeenCalledWith("/dashboard");
    expect(refresh).toHaveBeenCalled();
  });
});
