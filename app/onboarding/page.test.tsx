import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Onboarding page signup handoff", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("next-intl/server", () => ({
      getTranslations: vi.fn().mockResolvedValue((key: string) => key),
    }));
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn(),
    }));
    vi.doMock("@/components/site-header", () => ({
      SiteHeader: () => <header data-testid="site-header" />,
    }));
    vi.doMock("@/components/site-footer", () => ({
      SiteFooter: () => <footer data-testid="site-footer" />,
    }));
    vi.doMock("@/components/onboarding/plan-selector", () => ({
      OnboardingPlanSelector: ({
        initialInterval,
        autoStartPlanKey,
        autoCompleteFreePlan,
      }: {
        initialInterval: "month" | "year";
        autoStartPlanKey: string | null;
        autoCompleteFreePlan: boolean;
      }) => (
        <div
          data-testid="plan-selector"
          data-interval={initialInterval}
          data-auto-start={autoStartPlanKey ?? ""}
          data-auto-complete-free={String(autoCompleteFreePlan)}
        />
      ),
    }));
    vi.doMock("@/lib/billing/capabilities", () => ({
      isBillingEnabled: () => true,
      isFreePlanEnabled: () => true,
    }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: { id: "user_123", email: "owner@example.com" },
            },
          }),
        },
        from: vi.fn((table: string) => {
          if (table !== "profiles") {
            throw new Error(`Unexpected table: ${table}`);
          }

          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { onboarding_completed_at: null },
              error: null,
            }),
          };
        }),
      }),
    }));
    vi.doMock("@/lib/team-context-cache", () => ({
      getCachedTeamContextForUser: vi.fn().mockResolvedValue({
        teamId: "team_123",
        teamName: "Acme Team",
        role: "owner",
      }),
    }));
    vi.doMock("@/lib/dashboard/team-snapshot", () => ({
      getDashboardBillingContext: vi.fn().mockResolvedValue({
        billingEnabled: true,
        subscription: null,
        effectivePlanKey: "free",
        billingInterval: null,
        memberCount: 1,
        isPaidPlan: false,
        canInviteMembers: false,
      }),
    }));
    vi.doMock("@/lib/stripe/config", () => ({
      plans: [
        { key: "starter", priceId: "price_starter", annualPriceId: "price_starter_year" },
        { key: "growth", priceId: "price_growth", annualPriceId: "price_growth_year" },
        { key: "pro", priceId: "price_pro", annualPriceId: "price_pro_year" },
      ],
      hasAnnualPricing: true,
    }));
    vi.doMock("@/lib/stripe/public-pricing", () => ({
      getPublicPricingCatalog: vi.fn().mockResolvedValue([
        {
          key: "starter",
          name: "Starter",
          amountMonthly: 25,
          amountAnnualMonthly: 20,
          description: "Starter",
          popular: false,
          features: [],
        },
      ]),
    }));
    vi.doMock("@/lib/team-context", () => ({
      canManageTeamBilling: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));
    vi.doMock("@/lib/stripe/checkout-success", () => ({
      syncCheckoutSuccessForTeam: vi.fn(),
    }));
  });

  it("passes paid signup continuation through to the plan selector", async () => {
    const OnboardingPage = (await import("./page")).default;
    const html = renderToStaticMarkup(
      await OnboardingPage({
        searchParams: Promise.resolve({ plan: "starter", interval: "year" }),
      }),
    );

    expect(html).toContain('data-interval="year"');
    expect(html).toContain('data-auto-start="starter"');
    expect(html).toContain('data-auto-complete-free="false"');
  });

  it("passes free signup continuation through to the plan selector", async () => {
    const OnboardingPage = (await import("./page")).default;
    const html = renderToStaticMarkup(
      await OnboardingPage({
        searchParams: Promise.resolve({ plan: "free" }),
      }),
    );

    expect(html).toContain('data-interval="month"');
    expect(html).toContain('data-auto-start=""');
    expect(html).toContain('data-auto-complete-free="true"');
  });
});
