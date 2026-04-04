// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("./public-header-actions", () => ({
  PublicHeaderActions: () => <div data-testid="public-header-actions" />,
}));

vi.mock("./user-dropdown", () => ({
  UserDropdown: () => <div data-testid="user-dropdown" />,
}));

vi.mock("@/components/dashboard-mobile-nav", () => ({
  DashboardMobileNav: () => <div data-testid="dashboard-mobile-nav" />,
}));

vi.mock("@/lib/env", () => ({
  env: {
    APP_FREE_PLAN_ENABLED: true,
  },
}));

describe("SiteHeader", () => {
  it("links the brand to the homepage on public pages", () => {
    const { container } = render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Common.brandName" })).toHaveAttribute("href", "/");
    expect(screen.getByTestId("public-header-actions")).toBeInTheDocument();
    expect(container.innerHTML).toContain("max-w-[1440px]");
    expect(container.innerHTML).not.toContain("max-w-[56rem]");
  });

  it("links the brand to the dashboard for signed-in dashboard views", () => {
    const { container } = render(
      <SiteHeader
        dashboardUser={{
          displayName: "Test User",
          userEmail: "user@example.com",
          avatarUrl: null,
          teamName: "Alpha",
          role: "owner",
          teamUiMode: "paid_team",
          canSwitchTeams: true,
          activeTeamId: "team_1",
          csrfToken: "csrf_token",
        }}
        dashboardNav={{
          teamUiMode: "paid_team",
          showAiNav: true,
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Common.brandName" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByTestId("user-dropdown")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-mobile-nav")).toBeInTheDocument();
    expect(container.innerHTML).toContain("max-w-[1680px]");
    expect(container.innerHTML).toContain("max-w-[56rem]");
  });
});
