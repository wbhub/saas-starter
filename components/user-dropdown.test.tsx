// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserDropdown } from "./user-dropdown";

const routerRefresh = vi.fn();
const fetchMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    refresh: routerRefresh,
  }),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

vi.mock("js-cookie", () => ({
  default: {
    set: vi.fn(),
  },
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    theme: "system",
    setTheme: vi.fn(),
  }),
}));

vi.mock("@/i18n/routing", () => ({
  routing: {
    locales: ["en", "es"],
  },
}));

vi.mock("@/app/dashboard/actions", () => ({
  logout: vi.fn(),
  switchActiveTeam: vi.fn(),
}));

function createTeamOptionsResponse(
  teams: Array<{
    teamId: string;
    teamName: string | null;
    role: "owner" | "admin" | "member";
  }>,
) {
  return {
    ok: true,
    json: async () => ({
      ok: true,
      teams,
    }),
  };
}

function renderDropdown(overrides?: Partial<ComponentProps<typeof UserDropdown>>) {
  return render(
    <UserDropdown
      displayName="Test User"
      userEmail="user@example.com"
      avatarUrl={null}
      teamName="Alpha"
      role="owner"
      teamUiMode="paid_team"
      canSwitchTeams
      activeTeamId="team_1"
      csrfToken="csrf_token"
      {...overrides}
    />,
  );
}

describe("UserDropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("does not retry team option loading in a loop after a fetch failure", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));

    renderDropdown();

    fireEvent.click(screen.getByRole("button", { name: "UserDropdown.label" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not load team options when team switching is unavailable", async () => {
    renderDropdown({ canSwitchTeams: false });

    fireEvent.click(screen.getByRole("button", { name: "UserDropdown.label" }));

    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("DashboardSidebar.team")).toBeNull();
  });

  it("still loads team options when switchability is unknown", async () => {
    fetchMock.mockResolvedValueOnce(
      createTeamOptionsResponse([
        { teamId: "team_1", teamName: "Alpha", role: "owner" },
        { teamId: "team_2", teamName: "Beta", role: "member" },
      ]) as Response,
    );

    renderDropdown({ canSwitchTeams: null });

    fireEvent.click(screen.getByRole("button", { name: "UserDropdown.label" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("option", { name: "Beta" })).toBeTruthy();
    });
  });

  it("refetches team options after refreshed team state changes", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createTeamOptionsResponse([
          { teamId: "team_1", teamName: "Alpha", role: "owner" },
          { teamId: "team_2", teamName: "Beta", role: "member" },
        ]) as Response,
      )
      .mockResolvedValueOnce(
        createTeamOptionsResponse([
          { teamId: "team_1", teamName: "Alpha Renamed", role: "owner" },
          { teamId: "team_2", teamName: "Beta", role: "member" },
        ]) as Response,
      );

    const view = renderDropdown();

    fireEvent.click(screen.getByRole("button", { name: "UserDropdown.label" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("option", { name: "Alpha" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "UserDropdown.label" }));

    view.rerender(
      <UserDropdown
        displayName="Test User"
        userEmail="user@example.com"
        avatarUrl={null}
        teamName="Alpha Renamed"
        role="owner"
        teamUiMode="paid_team"
        canSwitchTeams
        activeTeamId="team_1"
        csrfToken="csrf_token"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "UserDropdown.label" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("option", { name: "Alpha Renamed" })).toBeTruthy();
    });
  });

  it("refetches team options whenever the menu is reopened", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createTeamOptionsResponse([
          { teamId: "team_1", teamName: "Alpha", role: "owner" },
          { teamId: "team_2", teamName: "Beta", role: "member" },
        ]) as Response,
      )
      .mockResolvedValueOnce(
        createTeamOptionsResponse([
          { teamId: "team_1", teamName: "Alpha", role: "owner" },
          { teamId: "team_2", teamName: "Beta Updated", role: "member" },
        ]) as Response,
      );

    renderDropdown();

    fireEvent.click(screen.getByRole("button", { name: "UserDropdown.label" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("option", { name: "Beta" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "UserDropdown.label" }));
    fireEvent.click(screen.getByRole("button", { name: "UserDropdown.label" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("option", { name: "Beta Updated" })).toBeTruthy();
    });
  });
});
