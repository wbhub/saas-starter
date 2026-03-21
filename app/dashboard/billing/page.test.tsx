import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const FREE_PLAN_FLAG = "APP_FREE_PLAN_ENABLED";
const GROWTH_PRICE_ID = "STRIPE_GROWTH_PRICE_ID";

function clearFreePlanEnv() {
  delete process.env[FREE_PLAN_FLAG];
  delete process.env[GROWTH_PRICE_ID];
}

function mockBillingPageDependencies(subscription: {
  status: "active";
  stripe_price_id: string;
  seat_quantity: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
} | null) {
  vi.doMock("next-intl/server", () => ({
    getTranslations: vi.fn(async (namespaceOrOptions?: string | { namespace?: string }) => {
      const namespace =
        typeof namespaceOrOptions === "string"
          ? namespaceOrOptions
          : namespaceOrOptions?.namespace;
      if (namespace === "DashboardBillingPage") {
        return (key: string) => {
          const dictionary: Record<string, string> = {
            "header.eyebrow": "Billing",
            "header.title": "Manage your subscription",
            "header.description": "Update plans, open the Stripe portal, and review your subscription status.",
            "currentSubscription.title": "Current subscription",
            "currentSubscription.currentPlan": "Current plan",
            "currentSubscription.unknown": "Unknown",
            "currentSubscription.status": "Status",
            "currentSubscription.seats": "Seats",
            "currentSubscription.periodEnd": "Period end",
            "currentSubscription.notAvailable": "N/A",
            "currentSubscription.currentPlanFree": "Current plan: Free",
            "currentSubscription.upgradeHint": "Upgrade below to unlock paid features.",
            "currentSubscription.noSubscription": "No subscription yet. Choose a plan below to get started.",
          };
          return dictionary[key] ?? key;
        };
      }
      return (key: string) => key;
    }),
    getLocale: vi.fn(async () => "en"),
  }));

  vi.doMock("@/lib/dashboard/server", () => ({
    getDashboardBaseData: vi.fn().mockResolvedValue({
      supabase: {},
      user: { email: "owner@example.com" },
      teamContext: { teamId: "team_123", teamName: "Acme Team", role: "owner" },
      teamContextLoadFailed: false,
      teamMemberships: [],
      displayName: "Owner",
    }),
    getLiveSubscription: vi.fn().mockResolvedValue(subscription),
  }));
  vi.doMock("@/lib/team-context", () => ({
    canManageTeamBilling: vi.fn().mockReturnValue(true),
  }));
  vi.doMock("@/components/dashboard-shell", () => ({
    DashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  }));
  vi.doMock("@/components/no-team-card", () => ({
    NoTeamCard: () => <div>No team</div>,
  }));
  vi.doMock("@/components/team-context-error-card", () => ({
    TeamContextErrorCard: () => <div>Team context error</div>,
  }));
  vi.doMock("@/components/support-email-card", () => ({
    SupportEmailCard: () => <div>Support</div>,
  }));
  vi.doMock("@/components/billing-actions", () => ({
    BillingActions: ({
      currentPlanKey,
      hasSubscription,
      canManageBilling,
    }: {
      currentPlanKey: string | null;
      hasSubscription: boolean;
      canManageBilling: boolean;
    }) => (
      <div
        data-testid="billing-actions"
        data-current-plan={currentPlanKey ?? ""}
        data-has-subscription={String(hasSubscription)}
        data-can-manage={String(canManageBilling)}
      />
    ),
  }));
}

describe("Dashboard billing page free plan behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    clearFreePlanEnv();
  });

  afterEach(() => {
    clearFreePlanEnv();
  });

  it("shows Free plan when enabled and no live paid subscription exists", async () => {
    process.env[FREE_PLAN_FLAG] = "true";
    mockBillingPageDependencies(null);

    const BillingPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await BillingPage());

    expect(html).toContain("Current plan: Free");
    expect(html).toContain("Upgrade below to unlock paid features.");
    expect(html).toContain('data-current-plan=""');
    expect(html).toContain('data-has-subscription="false"');
  });

  it("preserves no-subscription behavior when free is disabled", async () => {
    process.env[FREE_PLAN_FLAG] = "false";
    mockBillingPageDependencies(null);

    const BillingPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await BillingPage());

    expect(html).toContain("No subscription yet. Choose a plan below to get started.");
    expect(html).not.toContain("Current plan: Free");
    expect(html).toContain('data-current-plan=""');
    expect(html).toContain('data-has-subscription="false"');
  });

  it("still resolves paid subscriptions correctly", async () => {
    process.env[FREE_PLAN_FLAG] = "true";
    process.env[GROWTH_PRICE_ID] = "price_growth";
    mockBillingPageDependencies({
      status: "active",
      stripe_price_id: "price_growth",
      seat_quantity: 5,
      current_period_end: null,
      cancel_at_period_end: false,
    });

    const BillingPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await BillingPage());

    expect(html).toContain("Growth");
    expect(html).toContain('data-current-plan="growth"');
    expect(html).toContain('data-has-subscription="true"');
  });

  it("treats live subscription with unknown price as subscribed (not free)", async () => {
    process.env[FREE_PLAN_FLAG] = "true";
    process.env[GROWTH_PRICE_ID] = "price_growth";
    mockBillingPageDependencies({
      status: "active",
      stripe_price_id: "price_unknown",
      seat_quantity: 2,
      current_period_end: null,
      cancel_at_period_end: false,
    });

    const BillingPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await BillingPage());

    expect(html).toContain("Unknown");
    expect(html).not.toContain("Current plan: Free");
    expect(html).toContain('data-current-plan=""');
    expect(html).toContain('data-has-subscription="true"');
  });
});
