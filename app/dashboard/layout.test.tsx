import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DashboardLayout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn((path: string) => {
        throw new Error(`redirect:${path}`);
      }),
    }));
    vi.doMock("@/lib/billing/capabilities", () => ({
      isBillingEnabled: () => true,
    }));
  });

  it("renders the shared dashboard shell with Intercom", async () => {
    vi.doMock("@/components/intercom-provider", () => ({
      IntercomProvider: ({ appId }: { appId?: string }) => (
        <div data-testid="intercom-provider" data-app-id={appId} />
      ),
    }));
    vi.doMock("@/components/dashboard-shell", () => ({
      DashboardShell: ({
        children,
        teamUiMode,
        showAiNav,
      }: {
        children: ReactNode;
        teamUiMode: string;
        showAiNav: boolean;
      }) => (
        <div
          data-testid="dashboard-shell"
          data-team-ui-mode={teamUiMode}
          data-show-ai-nav={showAiNav}
        >
          {children}
        </div>
      ),
    }));
    vi.doMock("@/components/no-team-card", () => ({
      NoTeamCard: () => <div>No team</div>,
    }));
    vi.doMock("@/components/team-context-error-card", () => ({
      TeamContextErrorCard: () => <div>Team context error</div>,
    }));
    vi.doMock("@/lib/dashboard/server", () => ({
      getDashboardShellData: vi.fn().mockResolvedValue({
        user: { id: "user_123", email: "owner@example.com" },
        profile: {
          avatar_url: null,
          onboarding_completed_at: "2024-01-01T00:00:00Z",
        },
        teamContext: { teamId: "team_123", teamName: "Acme Team", role: "owner" },
        teamContextLoadFailed: false,
        displayName: "Owner",
        csrfToken: "csrf_token",
        supabase: {},
        billingContext: {
          billingEnabled: true,
          subscription: null,
          effectivePlanKey: "free",
          billingInterval: null,
          memberCount: 1,
          isPaidPlan: false,
          canInviteMembers: false,
        },
        aiUiGate: {
          isVisibleInUi: true,
          reason: "enabled",
          effectivePlanKey: "free",
          accessMode: "all",
        },
        teamUiMode: "free",
      }),
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        NEXT_PUBLIC_INTERCOM_APP_ID: "app_123",
        INTERCOM_IDENTITY_SECRET: "identity-secret",
      },
    }));
    const DashboardLayout = (await import("./layout")).default;
    const html = renderToStaticMarkup(
      await DashboardLayout({
        children: <div>dashboard child</div>,
      }),
    );

    expect(html).toContain('data-app-id="app_123"');
    expect(html).toContain('data-testid="dashboard-shell"');
    expect(html).toContain('data-team-ui-mode="free"');
    expect(html).toContain('data-show-ai-nav="true"');
    expect(html).toContain("dashboard child");
  });

  it("redirects back to onboarding when the free plan is not fully onboarded", async () => {
    vi.doMock("@/components/intercom-provider", () => ({
      IntercomProvider: () => <div>Intercom</div>,
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
    vi.doMock("@/lib/dashboard/server", () => ({
      getDashboardShellData: vi.fn().mockResolvedValue({
        user: { id: "user_123", email: "owner@example.com" },
        profile: { avatar_url: null, onboarding_completed_at: null },
        teamContext: { teamId: "team_123", teamName: "Acme Team", role: "owner" },
        teamContextLoadFailed: false,
        displayName: "Owner",
        csrfToken: "csrf_token",
        supabase: {},
        billingContext: {
          billingEnabled: true,
          subscription: null,
          effectivePlanKey: "free",
          billingInterval: null,
          memberCount: 1,
          isPaidPlan: false,
          canInviteMembers: false,
        },
        aiUiGate: {
          isVisibleInUi: true,
          reason: "enabled",
          effectivePlanKey: "free",
          accessMode: "all",
        },
        teamUiMode: "free",
      }),
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        NEXT_PUBLIC_INTERCOM_APP_ID: null,
        INTERCOM_IDENTITY_SECRET: null,
      },
    }));

    const DashboardLayout = (await import("./layout")).default;

    await expect(
      DashboardLayout({
        children: <div>dashboard child</div>,
      }),
    ).rejects.toThrow("redirect:/onboarding");
  });

  it("does not redirect when the profile row is temporarily unavailable", async () => {
    vi.doMock("@/components/intercom-provider", () => ({
      IntercomProvider: () => <div>Intercom</div>,
    }));
    vi.doMock("@/components/dashboard-shell", () => ({
      DashboardShell: ({ children, teamUiMode }: { children: ReactNode; teamUiMode: string }) => (
        <div data-team-ui-mode={teamUiMode}>{children}</div>
      ),
    }));
    vi.doMock("@/components/no-team-card", () => ({
      NoTeamCard: () => <div>No team</div>,
    }));
    vi.doMock("@/components/team-context-error-card", () => ({
      TeamContextErrorCard: () => <div>Team context error</div>,
    }));
    vi.doMock("@/lib/dashboard/server", () => ({
      getDashboardShellData: vi.fn().mockResolvedValue({
        user: { id: "user_123", email: "owner@example.com" },
        profile: null,
        teamContext: { teamId: "team_123", teamName: "Acme Team", role: "owner" },
        teamContextLoadFailed: false,
        displayName: "Owner",
        csrfToken: "csrf_token",
        supabase: {},
        billingContext: {
          billingEnabled: true,
          subscription: null,
          effectivePlanKey: "free",
          billingInterval: null,
          memberCount: 1,
          isPaidPlan: false,
          canInviteMembers: false,
        },
        aiUiGate: {
          isVisibleInUi: true,
          reason: "enabled",
          effectivePlanKey: "free",
          accessMode: "all",
        },
        teamUiMode: "free",
      }),
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        NEXT_PUBLIC_INTERCOM_APP_ID: null,
        INTERCOM_IDENTITY_SECRET: null,
      },
    }));

    const DashboardLayout = (await import("./layout")).default;
    const html = renderToStaticMarkup(
      await DashboardLayout({
        children: <div>dashboard child</div>,
      }),
    );

    expect(html).toContain("dashboard child");
    expect(html).toContain('data-team-ui-mode="free"');
  });

  it("renders the no-team fallback when the shared shell has no active team", async () => {
    vi.doMock("@/components/intercom-provider", () => ({
      IntercomProvider: () => <div>Intercom</div>,
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
    vi.doMock("@/lib/dashboard/server", () => ({
      getDashboardShellData: vi.fn().mockResolvedValue({
        teamContext: null,
        teamContextLoadFailed: false,
        billingContext: null,
        teamUiMode: null,
      }),
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        NEXT_PUBLIC_INTERCOM_APP_ID: null,
        INTERCOM_IDENTITY_SECRET: null,
      },
    }));

    const DashboardLayout = (await import("./layout")).default;
    const html = renderToStaticMarkup(
      await DashboardLayout({
        children: <div>dashboard child</div>,
      }),
    );

    expect(html).toContain("No team");
    expect(html).not.toContain("dashboard child");
  });
});
