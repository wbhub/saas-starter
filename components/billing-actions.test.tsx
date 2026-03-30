import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingActions } from "./billing-actions";

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, string>) => {
    if (namespace === "Landing.pricing") {
      const names: Record<string, string> = {
        "plans.starter.name": "Starter",
        "plans.growth.name": "Growth",
        "plans.pro.name": "Pro",
      };
      return names[key] ?? key;
    }
    if (key === "portal.cta") return "Open billing portal";
    if (key === "actions.switchTo") return `Switch to ${values?.name ?? ""}`.trim();
    return key;
  },
}));

describe("BillingActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides billing portal CTA for roles that cannot manage billing", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey="starter"
        hasSubscription={true}
        canManageBilling={false}
      />,
    );

    expect(html).not.toContain("Open billing portal");
  });

  it("shows billing portal CTA when role can manage and subscription exists", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey="starter"
        hasSubscription={true}
        canManageBilling={true}
      />,
    );

    expect(html).toContain("Open billing portal");
  });

  it("shows plan switch buttons for other tiers when subscribed", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey="starter"
        hasSubscription={true}
        canManageBilling={true}
      />,
    );

    expect(html).toContain("Switch to Growth");
    expect(html).toContain("Switch to Pro");
  });

  it("hides billing portal CTA when there is no subscription", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey={null}
        hasSubscription={false}
        canManageBilling={true}
      />,
    );

    expect(html).not.toContain("Open billing portal");
  });

  it("hides billing actions when billing is disabled", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={false}
        currentPlanKey={null}
        hasSubscription={false}
        canManageBilling={true}
      />,
    );

    expect(html).not.toContain("Open billing portal");
    expect(html).toContain("description.billingDisabled");
  });
});
