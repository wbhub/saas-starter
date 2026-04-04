import type { ReactNode } from "react";
import type { TeamRole } from "@/lib/team-context";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import {
  DashboardShellColumns,
  DashboardShellFrame,
  DashboardShellSection,
} from "@/components/layout-shells";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

type DashboardShellProps = {
  displayName: string;
  userEmail: string | null;
  avatarUrl: string | null;
  teamName: string | null;
  role: TeamRole;
  teamUiMode: "free" | "paid_solo" | "paid_team";
  canSwitchTeams: boolean | null;
  showAiNav: boolean;
  activeTeamId: string;
  csrfToken: string;
  children: ReactNode;
};

export function DashboardShell({
  displayName,
  userEmail,
  avatarUrl,
  teamName,
  role,
  teamUiMode,
  canSwitchTeams,
  showAiNav,
  activeTeamId,
  csrfToken,
  children,
}: DashboardShellProps) {
  return (
    <div className="app-content flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader
        dashboardUser={{
          displayName,
          userEmail,
          avatarUrl,
          teamName,
          role,
          teamUiMode,
          canSwitchTeams,
          activeTeamId,
          csrfToken,
        }}
        dashboardNav={{
          teamUiMode,
          showAiNav,
        }}
      />
      <main className="flex-1">
        <DashboardShellFrame className="py-5 sm:py-6 lg:py-8">
          <DashboardShellColumns>
            <DashboardSidebar teamUiMode={teamUiMode} showAiNav={showAiNav} />
            <div className="min-w-0">
              <DashboardShellSection className="space-y-6 lg:space-y-8">
                {children}
              </DashboardShellSection>
            </div>
          </DashboardShellColumns>
        </DashboardShellFrame>
      </main>
      <SiteFooter dashboard />
    </div>
  );
}
