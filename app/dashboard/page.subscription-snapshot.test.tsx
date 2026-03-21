import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const FREE_PLAN_FLAG = "APP_FREE_PLAN_ENABLED";
const GROWTH_PRICE_ID = "STRIPE_GROWTH_PRICE_ID";

function clearPlanEnv() {
  delete process.env[FREE_PLAN_FLAG];
  delete process.env[GROWTH_PRICE_ID];
}

function mockDashboardDependencies(subscription: {
  status: "active";
  stripe_price_id: string;
  seat_quantity: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
} | null) {
  vi.doMock("@/lib/dashboard/server", () => ({
    getDashboardBaseData: vi.fn().mockResolvedValue({
      supabase: {},
      user: {
        id: "user_123",
        email: "owner@example.com",
        created_at: "2026-01-01T00:00:00Z",
      },
      profile: { created_at: "2026-01-01T00:00:00Z" },
      teamContext: { teamId: "team_123", teamName: "Acme Team", role: "owner" },
      teamContextLoadFailed: false,
      teamMemberships: [],
      displayName: "Owner",
    }),
    getLiveSubscription: vi.fn().mockResolvedValue(subscription),
  }));
  vi.doMock("next-intl/server", () => ({
    getTranslations: vi.fn().mockResolvedValue((key: string, values?: { name?: string }) => {
      if (key === "DashboardPage.currentPlanFree") {
        return "Current plan: Free";
      }
      if (key === "DashboardPage.visitBillingUpgrade") {
        return "Visit billing to upgrade anytime.";
      }
      if (key === "DashboardPage.noActiveSubscription") {
        return "No active subscription. Visit billing to start a plan.";
      }
      if (key === "DashboardPage.welcome") {
        return `Welcome back, ${values?.name ?? "there"}.`;
      }
      return key;
    }),
  }));
  vi.doMock("next/link", () => ({
    default: ({
      href,
      children,
      className,
    }: {
      href: string;
      children: ReactNode;
      className?: string;
    }) => (
      <a href={href} className={className}>
        {children}
      </a>
    ),
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
}

describe("Dashboard page subscription snapshot free plan behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    clearPlanEnv();
  });

  afterEach(() => {
    clearPlanEnv();
  });

  it("shows Free plan when enabled and no live paid subscription exists", async () => {
    process.env[FREE_PLAN_FLAG] = "true";
    mockDashboardDependencies(null);

    const DashboardPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain("Current plan: Free");
    expect(html).toContain("Visit billing to upgrade anytime.");
    expect(html).not.toContain("No active subscription. Visit billing to start a plan.");
  });

  it("preserves no-active-subscription messaging when free is disabled", async () => {
    process.env[FREE_PLAN_FLAG] = "false";
    mockDashboardDependencies(null);

    const DashboardPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain("No active subscription. Visit billing to start a plan.");
    expect(html).not.toContain("Current plan: Free");
  });

  it("still resolves paid subscriptions correctly", async () => {
    process.env[FREE_PLAN_FLAG] = "true";
    process.env[GROWTH_PRICE_ID] = "price_growth";
    mockDashboardDependencies({
      status: "active",
      stripe_price_id: "price_growth",
      seat_quantity: 4,
      current_period_end: null,
      cancel_at_period_end: false,
    });

    const DashboardPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain("Growth");
    expect(html).not.toContain("Current plan: Free");
  });
});
