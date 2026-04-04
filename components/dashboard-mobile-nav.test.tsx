// @vitest-environment jsdom

import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pathnameMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const dictionary: Record<string, string> = {
      "DashboardSidebar.appDashboard": "App Dashboard",
      "DashboardSidebar.overview": "Overview",
      "DashboardSidebar.ai": "AI",
      "DashboardSidebar.team": "Team",
      "DashboardSidebar.billing": "Billing",
      "DashboardSidebar.settings": "Settings",
      "DashboardSidebar.support": "Support",
    };

    return dictionary[key] ?? key;
  },
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/sheet", async () => {
  const ReactModule = await import("react");
  const SheetContext = ReactModule.createContext(false);

  return {
    Sheet: ({
      open,
      children,
    }: {
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
      children: React.ReactNode;
    }) => <SheetContext.Provider value={Boolean(open)}>{children}</SheetContext.Provider>,
    SheetContent: ({ children }: { children: React.ReactNode }) => {
      const open = ReactModule.useContext(SheetContext);
      return open ? <div>{children}</div> : null;
    },
    SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

describe("DashboardMobileNav", () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue("/dashboard/support");
  });

  it("opens from the header trigger and closes after navigation", async () => {
    const { DashboardMobileNav } = await import("./dashboard-mobile-nav");

    render(<DashboardMobileNav teamUiMode="paid_team" showAiNav={true} />);

    expect(screen.queryByText("Billing")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "App Dashboard" }));

    expect(screen.getByRole("link", { name: "Billing" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Billing" }));

    expect(screen.queryByText("Billing")).not.toBeInTheDocument();
  });
});
