import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DashboardShell", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses the shared wide site container for dashboard content", async () => {
    vi.doMock("@/components/site-header", () => ({
      SiteHeader: () => <header data-testid="site-header" />,
    }));
    vi.doMock("@/components/site-footer", () => ({
      SiteFooter: ({ dashboard = false }: { dashboard?: boolean }) => (
        <footer data-dashboard={dashboard ? "true" : "false"} data-testid="site-footer" />
      ),
    }));
    vi.doMock("@/components/dashboard-sidebar", () => ({
      DashboardSidebar: () => <aside data-testid="dashboard-sidebar" />,
    }));

    const { DashboardShell } = await import("./dashboard-shell");
    const html = renderToStaticMarkup(
      <DashboardShell
        displayName="Test User"
        userEmail="user@example.com"
        avatarUrl={null}
        teamName="Alpha"
        role="owner"
        teamUiMode="paid_team"
        canSwitchTeams={true}
        showAiNav={true}
        activeTeamId="team_1"
        csrfToken="csrf_token"
      >
        <div>dashboard child</div>
      </DashboardShell>,
    );

    expect(html).toContain('data-testid="site-header"');
    expect(html).toContain('data-testid="dashboard-sidebar"');
    expect(html).toContain('data-testid="site-footer"');
    expect(html).toContain('data-dashboard="true"');
    expect(html).toContain("max-w-[1680px]");
    expect(html).toContain("max-w-[56rem]");
    expect(html).toContain("dashboard child");
  });
});
