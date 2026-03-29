import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DashboardSidebar", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses the shortened AI and Team labels for solo workspaces", async () => {
    vi.doMock("next/navigation", () => ({
      usePathname: () => "/dashboard",
    }));
    vi.doMock("next-intl", () => ({
      useTranslations: () => (key: string) => {
        const dictionary: Record<string, string> = {
          "DashboardSidebar.overview": "Overview",
          "DashboardSidebar.ai": "AI",
          "DashboardSidebar.billing": "Billing",
          "DashboardSidebar.team": "Team",
          "DashboardSidebar.settings": "Settings",
          "DashboardSidebar.support": "Support",
        };
        return dictionary[key] ?? key;
      },
    }));
    const { DashboardSidebar: Sidebar } = await import("./dashboard-sidebar");

    const html = renderToStaticMarkup(<Sidebar teamUiMode="paid_solo" showAiNav={true} />);

    expect(html).toContain(">AI<");
    expect(html).toContain(">Team<");
    expect(html).not.toContain("AI Chat");
    expect(html).not.toContain("Invite teammates");
  });
});
