import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

describe("Dashboard settings page data loading", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("loads team members for paid teams and renders organization settings", async () => {
    const getTeamMembers = vi.fn().mockResolvedValue([
      {
        userId: "user_123",
        fullName: "Owner Example",
        email: "owner@example.com",
        avatarUrl: null,
        role: "owner",
      },
    ]);

    vi.doMock("next-intl/server", () => ({
      getTranslations: vi.fn().mockResolvedValue((key: string) => key),
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
          billingInterval: "month",
          memberCount: 2,
          isPaidPlan: true,
          canInviteMembers: true,
        },
        teamUiMode: "paid_team",
        csrfToken: "csrf_token",
      }),
      getTeamMembers,
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

    expect(getTeamMembers).toHaveBeenCalledWith({ marker: "supabase-client" }, "team_123");
    expect(html).toContain('data-team-name="Acme Team"');
  });
});
