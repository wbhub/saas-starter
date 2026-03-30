import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

function mockBillingPageDependencies(options: {
  aiUiGateVisible?: boolean;
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
    billingInterval?: "month" | "year" | null;
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
            return `${values?.seats ?? ""} seats × ${values?.seatCost ?? ""} = ${values?.monthlyTotal ?? ""}/mo`;
          }
          const dictionary: Record<string, string> = {
            "header.eyebrow": "Billing",
            "header.title": "Manage your subscription",
            "header.description":
              "Update plans, open the Stripe portal, and review your subscription status.",
            "currentSubscription.title": "Current subscription",
            "currentSubscription.subtitle": "Plan details",
            "currentSubscription.currentPlan": "Current plan",
            "currentSubscription.unknown": "Unknown",
            "currentSubscription.status": "Status",
            "currentSubscription.statusLabels.active": "ACTIVE",
            "currentSubscription.seats": "Seats",
            "currentSubscription.perSeatCost": "Per-seat cost",
            "currentSubscription.periodEnd": "Period end",
            "currentSubscription.notAvailable": "N/A",
            "currentSubscription.noSubscription": "No subscription yet.",
            "freeMode.title": "Unlock premium features",
            "freeMode.description": "Choose a paid plan to unlock advanced features.",
            "freeMode.compareTitle": "Compare plans",
            "freeMode.compareDescription": "Compare tiers.",
            "freeMode.popularBadge": "Popular",
            "freeMode.perSeat": `Each teammate costs ${values?.amount ?? ""}.`,
            "freeMode.collaborationIncluded": "Team collaboration included on all paid plans.",
            "checkoutSuccess.title": "Payment received",
            "checkoutSuccess.message":
              "Payment successful! Your subscription is now active.",
          };
          return dictionary[key] ?? key;
        };
      }
      if (namespace === "DashboardUsagePage") {
        return (key: string) => {
          const dictionary: Record<string, string> = {
            "header.title": "Team AI Usage",
            "table.title": "AI usage and monthly totals",
            "table.noUsage": "No usage data yet",
            "table.noUsageDescription": "Track recent token usage for your team.",
            "table.month": "Month",
            "table.usedTokens": "Used tokens",
            "table.reservedTokens": "Reserved tokens",
          };
          return dictionary[key] ?? key;
        };
      }
      return (key: string) => key;
    }),
    getLocale: vi.fn(async () => "en"),
  }));

  const billingContextWithInterval = {
    billingInterval: null,
    ...options.billingContext,
  };
  vi.doMock("@/lib/dashboard/server", () => ({
    getDashboardBaseData: vi.fn().mockResolvedValue({
      teamContext: { teamId: "team_123", teamName: "Acme Team", role: "owner" },
    }),
    getDashboardShellData: vi.fn().mockResolvedValue({
      teamContext: { teamId: "team_123", teamName: "Acme Team", role: "owner" },
      billingContext: billingContextWithInterval,
      aiUiGate: {
        isVisibleInUi: options.aiUiGateVisible ?? true,
        reason: (options.aiUiGateVisible ?? true) ? "enabled" : "ai_not_configured",
      },
      teamUiMode: options.billingContext.isPaidPlan
        ? options.billingContext.memberCount > 1
          ? "paid_team"
          : "paid_solo"
        : "free",
    }),
  }));
  vi.doMock("@/lib/stripe/checkout-success", () => ({
    syncCheckoutSuccessForTeam: vi
      .fn()
      .mockResolvedValue({ synced: true, subscriptionId: "sub_1" }),
  }));
  vi.doMock("@/lib/stripe/public-pricing", () => ({
    getPublicPricingCatalog: vi.fn().mockResolvedValue([
      {
        key: "starter",
        name: "Starter",
        description: "Starter desc",
        priceLabel: "$25/mo",
        amountMonthly: 25,
        popular: false,
        features: [],
      },
      {
        key: "growth",
        name: "Growth",
        description: "Growth desc",
        priceLabel: "$50/mo",
        amountMonthly: 50,
        popular: true,
        features: [],
      },
      {
        key: "pro",
        name: "Pro",
        description: "Pro desc",
        priceLabel: "$100/mo",
        amountMonthly: 100,
        popular: false,
        features: [],
      },
    ]),
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: vi.fn().mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user_1" } } }) },
    }),
  }));
  vi.doMock("@/lib/team-context-cache", () => ({
    getCachedTeamContextForUser: vi.fn().mockResolvedValue({ teamId: "team_123" }),
  }));
  vi.doMock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  }));
  vi.doMock("@/lib/team-context", () => ({
    canManageTeamBilling: vi.fn().mockReturnValue(true),
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
  vi.doMock("@/components/ai-usage-card", () => ({
    AiUsageCard: ({ teamId, copy }: { teamId: string; copy: { title: string } }) => (
      <div data-testid="ai-usage-card" data-title={copy.title}>
        {teamId}
      </div>
    ),
    AiUsageCardSkeleton: () => <div data-testid="ai-usage-card-skeleton" />,
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
    expect(html).toContain('data-testid="ai-usage-card"');
    expect(html).toContain('data-title="Team AI Usage"');
  });

  it("renders billing for paid solo teams without invite nudge section", async () => {
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
        billingInterval: "month",
        memberCount: 1,
        isPaidPlan: true,
        canInviteMembers: true,
      },
    });

    const BillingPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await BillingPage());

    expect(html).not.toContain("Invite teammates when you are ready");
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
        billingInterval: "month",
        memberCount: 3,
        isPaidPlan: true,
        canInviteMembers: true,
      },
    });

    const BillingPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await BillingPage());

    expect(html).toContain("3 seats × $50/mo = $150/mo");
    expect(html).toContain('data-current-plan="growth"');
    expect(html).toContain('data-has-subscription="true"');
  });

  it("shows checkout success banner when redirected from Stripe", async () => {
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
    const html = renderToStaticMarkup(
      await BillingPage({
        searchParams: Promise.resolve({ checkout: "success" }),
      }),
    );

    expect(html).toContain("Payment received");
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

  it("hides the usage card when AI is not enabled in the UI", async () => {
    mockBillingPageDependencies({
      aiUiGateVisible: false,
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

    expect(html).not.toContain('data-testid="ai-usage-card"');
  });
});
