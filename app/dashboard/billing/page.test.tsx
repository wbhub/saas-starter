import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

function mockBillingPageDependencies(options: {
  billingContext: {
    billingEnabled?: boolean;
    subscription: {
      status: "active";
      stripe_price_id: string;
      seat_quantity: number;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
    } | null;
    effectivePlanKey: "free" | "starter" | "growth" | "pro" | null;
    memberCount: number;
    isPaidPlan: boolean;
    canInviteMembers: boolean;
  };
}) {
  vi.doMock("next-intl/server", () => ({
    getTranslations: vi.fn(async (namespaceOrOptions?: string | { namespace?: string }) => {
      const namespace =
        typeof namespaceOrOptions === "string" ? namespaceOrOptions : namespaceOrOptions?.namespace;
      if (namespace === "Landing.pricing") {
        return (key: string) => {
          const dictionary: Record<string, string> = {
            "priceSuffix.month": "/mo",
            "plans.starter.name": "Starter",
            "plans.growth.name": "Growth",
            "plans.pro.name": "Pro",
            "plans.starter.description": "Perfect for founders validating a new product.",
            "plans.growth.description": "For teams scaling activation and retention.",
            "plans.pro.description": "For businesses that need reliability at scale.",
          };
          return dictionary[key] ?? key;
        };
      }
      if (namespace === "DashboardBillingPage") {
        return (key: string, values?: Record<string, string>) => {
          if (key === "paidTeam.breakdown") {
            return `${values?.seats ?? ""} seats x ${values?.seatCost ?? ""} = ${values?.monthlyTotal ?? ""}/mo`;
          }
          const dictionary: Record<string, string> = {
            "header.eyebrow": "Billing",
            "header.title": "Manage your subscription",
            "header.description":
              "Update plans, open the Stripe portal, and review your subscription status.",
            "currentSubscription.title": "Current subscription",
            "currentSubscription.currentPlan": "Current plan",
            "currentSubscription.unknown": "Unknown",
            "currentSubscription.status": "Status",
            "currentSubscription.seats": "Seats",
            "currentSubscription.perSeatCost": "Per-seat cost",
            "currentSubscription.periodEnd": "Period end",
            "currentSubscription.notAvailable": "N/A",
            "currentSubscription.noSubscription": "No subscription yet.",
            "freeMode.title": "Unlock premium features",
            "freeMode.description": "Choose a paid plan to unlock advanced features.",
            "freeMode.perSeat": `Each teammate costs ${values?.amount ?? ""}.`,
            "freeMode.collaborationIncluded": "Team collaboration included on all paid plans.",
            "paidSolo.title": "Invite teammates when you are ready",
            "paidSolo.description": "Collaboration is optional.",
            "paidSolo.action": "Invite teammates",
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
      csrfToken: "csrf_token",
    }),
    getDashboardBillingContext: vi.fn().mockResolvedValue(options.billingContext),
    getDashboardAiUiGate: vi.fn().mockResolvedValue({
      isVisibleInUi: true,
      reason: "enabled",
      effectivePlanKey: options.billingContext.effectivePlanKey,
      accessMode: "all",
    }),
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
      billingEnabled,
      currentPlanKey,
      hasSubscription,
      canManageBilling,
    }: {
      billingEnabled: boolean;
      currentPlanKey: string | null;
      hasSubscription: boolean;
      canManageBilling: boolean;
    }) => (
      <div
        data-testid="billing-actions"
        data-current-plan={currentPlanKey ?? ""}
        data-has-subscription={String(hasSubscription)}
        data-can-manage={String(canManageBilling)}
        data-billing-enabled={String(billingEnabled)}
      />
    ),
  }));
}

describe("Dashboard billing page free plan behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("renders plan comparison cards for free mode", async () => {
    mockBillingPageDependencies({
      billingContext: {
        billingEnabled: true,
        subscription: null,
        effectivePlanKey: "free",
        memberCount: 1,
        isPaidPlan: false,
        canInviteMembers: false,
      },
    });

    const BillingPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await BillingPage());

    expect(html).toContain("Unlock premium features");
    expect(html).toContain("Team collaboration included on all paid plans.");
    expect(html).toContain("Starter");
    expect(html).toContain('data-current-plan=""');
    expect(html).toContain('data-has-subscription="false"');
  });

  it("renders invite nudge for paid solo teams", async () => {
    mockBillingPageDependencies({
      billingContext: {
        billingEnabled: true,
        subscription: {
          status: "active",
          stripe_price_id: "price_growth",
          seat_quantity: 1,
          current_period_end: null,
          cancel_at_period_end: false,
        },
        effectivePlanKey: "growth",
        memberCount: 1,
        isPaidPlan: true,
        canInviteMembers: true,
      },
    });

    const BillingPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await BillingPage());

    expect(html).toContain("Invite teammates when you are ready");
    expect(html).toContain("Invite teammates");
    expect(html).toContain('data-current-plan="growth"');
    expect(html).toContain('data-has-subscription="true"');
  });

  it("renders seat breakdown for paid teams with multiple members", async () => {
    mockBillingPageDependencies({
      billingContext: {
        billingEnabled: true,
        subscription: {
          status: "active",
          stripe_price_id: "price_growth",
          seat_quantity: 3,
          current_period_end: null,
          cancel_at_period_end: false,
        },
        effectivePlanKey: "growth",
        memberCount: 3,
        isPaidPlan: true,
        canInviteMembers: true,
      },
    });

    const BillingPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await BillingPage());

    expect(html).toContain("3 seats x $50/mo = $150/mo");
    expect(html).toContain('data-current-plan="growth"');
    expect(html).toContain('data-has-subscription="true"');
  });

  it("renders explicit billing-disabled state", async () => {
    mockBillingPageDependencies({
      billingContext: {
        billingEnabled: false,
        subscription: null,
        effectivePlanKey: "free",
        memberCount: 1,
        isPaidPlan: false,
        canInviteMembers: false,
      },
    });

    const BillingPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await BillingPage());

    expect(html).toContain("billingDisabled.title");
    expect(html).toContain('data-billing-enabled="false"');
  });
});
