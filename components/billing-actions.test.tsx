import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingActions } from "./billing-actions";
import type { PublicPricingPlan } from "@/lib/stripe/plans";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, string>) => {
    if (namespace === "Landing.pricing") {
      const names: Record<string, string> = {
        "plans.starter.name": "Starter",
        "plans.growth.name": "Growth",
        "plans.pro.name": "Pro",
        "plans.starter.description": "For founders",
        "plans.growth.description": "For growing teams",
        "plans.pro.description": "For enterprises",
        mostPopular: "Most popular",
      };
      return names[key] ?? key;
    }
    if (key === "portal.cta") return "Open Billing Portal";
    if (key === "actions.switchTo") return `Switch to ${values?.name ?? ""}`.trim();
    if (key === "currentPlanBadge") return "Current plan";
    if (key === "actions.getStarted") return "Get started";
    if (key === "toggle.monthly") return "Monthly";
    if (key === "toggle.annual") return "Annual";
    if (key === "intervalNote") return "Use the billing portal to change cycle.";
    return key;
  },
}));

const mockPlans: PublicPricingPlan[] = [
  {
    key: "starter",
    name: "Starter",
    description: "For founders",
    priceLabel: "$25/mo",
    annualPriceLabel: "$20/mo",
    amountMonthly: 25,
    amountAnnualMonthly: 20,
    features: ["Up to 5 team members", "Real-time data syncing", "Basic integrations"],
  },
  {
    key: "growth",
    name: "Growth",
    description: "For growing teams",
    priceLabel: "$50/mo",
    annualPriceLabel: "$40/mo",
    amountMonthly: 50,
    amountAnnualMonthly: 40,
    popular: true,
    features: ["AI-powered features", "Advanced analytics", "Priority email support"],
  },
  {
    key: "pro",
    name: "Pro",
    description: "For enterprises",
    priceLabel: "$100/mo",
    annualPriceLabel: "$80/mo",
    amountMonthly: 100,
    amountAnnualMonthly: 80,
    features: ["Unlimited team members", "Audit logging", "Dedicated support"],
  },
];

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
        plans={mockPlans}
        showAnnualToggle={false}
        currentBillingInterval="month"
      />,
    );

    expect(html).not.toContain("Open Billing Portal");
  });

  it("shows billing portal CTA when role can manage and subscription exists", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey="starter"
        hasSubscription={true}
        canManageBilling={true}
        plans={mockPlans}
        showAnnualToggle={false}
        currentBillingInterval="month"
      />,
    );

    expect(html).toContain("Open Billing Portal");
  });

  it("shows plan switch buttons for other tiers when subscribed", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey="starter"
        hasSubscription={true}
        canManageBilling={true}
        plans={mockPlans}
        showAnnualToggle={false}
        currentBillingInterval="month"
      />,
    );

    expect(html).toContain("Switch to Growth");
    expect(html).toContain("Switch to Pro");
  });

  it("hides the billing interval toggle for existing subscribers", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey="starter"
        hasSubscription={true}
        canManageBilling={true}
        plans={mockPlans}
        showAnnualToggle={true}
        currentBillingInterval="month"
      />,
    );

    expect(html).not.toContain("Monthly");
    expect(html).not.toContain("Annual");
    expect(html).not.toContain("Use the billing portal to change cycle.");
  });

  it("keeps the billing interval toggle for new checkouts", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey={null}
        hasSubscription={false}
        canManageBilling={true}
        plans={mockPlans}
        showAnnualToggle={true}
        currentBillingInterval={null}
      />,
    );

    expect(html).toContain("Monthly");
    expect(html).toContain("Annual");
  });

  it("shows current plan badge on the active plan", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey="starter"
        hasSubscription={true}
        canManageBilling={true}
        plans={mockPlans}
        showAnnualToggle={false}
        currentBillingInterval="month"
      />,
    );

    expect(html).toContain("Current plan");
  });

  it("hides billing portal CTA when there is no subscription", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey={null}
        hasSubscription={false}
        canManageBilling={true}
        plans={mockPlans}
        showAnnualToggle={false}
        currentBillingInterval={null}
      />,
    );

    expect(html).not.toContain("Open Billing Portal");
  });

  it("shows plan cards with features and get started buttons for non-subscribers", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey={null}
        hasSubscription={false}
        canManageBilling={true}
        plans={mockPlans}
        showAnnualToggle={false}
        currentBillingInterval={null}
      />,
    );

    expect(html).toContain("$25/mo");
    expect(html).toContain("$50/mo");
    expect(html).toContain("$100/mo");
    expect(html).toContain("Get started");
    expect(html).toContain("Up to 5 team members");
    expect(html).toContain("AI-powered features");
  });

  it("does not show switch button for the current plan", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey="starter"
        hasSubscription={true}
        canManageBilling={true}
        plans={mockPlans}
        showAnnualToggle={false}
        currentBillingInterval="month"
      />,
    );

    expect(html).not.toContain("Switch to Starter");
    expect(html).toContain("Switch to Growth");
    expect(html).toContain("Switch to Pro");
  });

  it("uses outline variant for downgrade buttons, default variant for upgrades", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={true}
        currentPlanKey="growth"
        hasSubscription={true}
        canManageBilling={true}
        plans={mockPlans}
        showAnnualToggle={false}
        currentBillingInterval="month"
      />,
    );

    // "Switch to Starter" (downgrade) should NOT have the primary bg class
    const starterButtonMatch = html.match(
      /<button[^>]*>(?:[^<]*<[^/][^>]*>)*[^<]*Switch to Starter[^<]*/,
    );
    expect(starterButtonMatch).not.toBeNull();
    expect(starterButtonMatch![0]).not.toContain("bg-primary");

    // "Switch to Pro" (upgrade) SHOULD have the primary bg class
    const proButtonMatch = html.match(/<button[^>]*>(?:[^<]*<[^/][^>]*>)*[^<]*Switch to Pro[^<]*/);
    expect(proButtonMatch).not.toBeNull();
    expect(proButtonMatch![0]).toContain("bg-primary");
  });

  it("hides billing actions when billing is disabled", () => {
    const html = renderToStaticMarkup(
      <BillingActions
        billingEnabled={false}
        currentPlanKey={null}
        hasSubscription={false}
        canManageBilling={true}
        plans={mockPlans}
        showAnnualToggle={false}
        currentBillingInterval={null}
      />,
    );

    expect(html).not.toContain("Open Billing Portal");
    expect(html).toContain("description.billingDisabled");
  });
});
