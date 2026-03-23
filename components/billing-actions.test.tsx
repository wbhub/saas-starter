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
    if (key === "actions.manageBilling") return "Manage billing";
    if (key === "actions.subscribe") return `Subscribe ${values?.name ?? ""}`.trim();
    if (key === "actions.switchTo") return `Switch to ${values?.name ?? ""}`.trim();
    return key;
  },
}));

describe("BillingActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides Manage billing for roles that cannot manage billing", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey="starter"
        hasSubscription={true}
        canManageBilling={false}
      />,
    );

    expect(html).not.toContain("Manage billing");
  });

  it("shows Manage billing when role can manage and subscription exists", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey="starter"
        hasSubscription={true}
        canManageBilling={true}
      />,
    );

    expect(html).toContain("Manage billing");
  });

  it("hides Manage billing when there is no subscription", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey={null}
        hasSubscription={false}
        canManageBilling={true}
      />,
    );

    expect(html).not.toContain("Manage billing");
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

    expect(html).not.toContain("Manage billing");
    expect(html).toContain("description.billingDisabled");
    expect(html).toContain("messages.billingDisabled");
  });
});
