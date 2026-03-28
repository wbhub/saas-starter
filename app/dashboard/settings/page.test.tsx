import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

describe("Dashboard settings page data loading", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("loads notification preferences separately from the shared shell data", async () => {
    const getDashboardNotificationPreferences = vi.fn().mockResolvedValue({
      marketing_emails: true,
      product_updates: false,
      security_alerts: true,
    });

    vi.doMock("next-intl/server", () => ({
      getTranslations: vi.fn().mockResolvedValue((key: string) => key),
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
    vi.doMock("@/lib/dashboard/server", () => ({
      getDashboardShellData: vi.fn().mockResolvedValue({
        supabase: { marker: "supabase-client" },
        user: {
          id: "user_123",
          email: "owner@example.com",
        },
        profile: {
          full_name: "Owner Example",
          avatar_url: null,
        },
        teamContext: {
          teamId: "team_123",
          teamName: "Acme Team",
          role: "owner",
        },
        billingContext: {
          billingEnabled: true,
          subscription: {
            status: "active",
            stripe_price_id: "price_growth",
            seat_quantity: 2,
            current_period_end: null,
            cancel_at_period_end: false,
          },
          effectivePlanKey: "growth",
          memberCount: 2,
          isPaidPlan: true,
          canInviteMembers: true,
        },
        teamUiMode: "paid_team",
        csrfToken: "csrf_token",
      }),
      getDashboardNotificationPreferences,
      getTeamMembers: vi.fn().mockResolvedValue([
        {
          userId: "user_123",
          fullName: "Owner Example",
          role: "owner",
        },
      ]),
    }));
    vi.doMock("@/components/dashboard-settings-card", () => ({
      DashboardSettingsCard: ({ email }: { email: string | null }) => (
        <div data-testid="dashboard-settings-card" data-email={email ?? ""} />
      ),
    }));
    vi.doMock("@/components/email-settings-card", () => ({
      EmailSettingsCard: ({ email }: { email: string | null }) => (
        <div data-testid="email-settings-card" data-email={email ?? ""} />
      ),
    }));
    vi.doMock("@/components/notification-preferences-card", () => ({
      NotificationPreferencesCard: ({
        marketingEmails,
        productUpdates,
        securityAlerts,
      }: {
        marketingEmails: boolean;
        productUpdates: boolean;
        securityAlerts: boolean;
      }) => (
        <div
          data-testid="notification-preferences-card"
          data-marketing-emails={String(marketingEmails)}
          data-product-updates={String(productUpdates)}
          data-security-alerts={String(securityAlerts)}
        />
      ),
    }));
    vi.doMock("@/components/organization-settings-card", () => ({
      OrganizationSettingsCard: ({ teamName }: { teamName: string }) => (
        <div data-testid="organization-settings-card" data-team-name={teamName} />
      ),
    }));
    vi.doMock("@/components/security-settings-card", () => ({
      SecuritySettingsCard: () => <div data-testid="security-settings-card" />,
    }));
    vi.doMock("@/components/danger-zone-card", () => ({
      DangerZoneCard: () => <div data-testid="danger-zone-card" />,
    }));

    const DashboardSettingsPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await DashboardSettingsPage());

    expect(getDashboardNotificationPreferences).toHaveBeenCalledWith(
      { marker: "supabase-client" },
      "user_123",
    );
    expect(html).toContain('data-marketing-emails="true"');
    expect(html).toContain('data-product-updates="false"');
    expect(html).toContain('data-security-alerts="true"');
    expect(html).toContain('data-team-name="Acme Team"');
  });
});
