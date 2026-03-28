import type { ReactNode } from "react";
import type { TeamRole } from "@/lib/team-context";
import type { DashboardTeamOption } from "@/lib/dashboard/server";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

type DashboardShellProps = {
  displayName: string;
  userEmail: string | null;
  avatarUrl: string | null;
  teamName: string | null;
  role: TeamRole;
  teamUiMode: "free" | "paid_solo" | "paid_team";
  showAiNav: boolean;
  activeTeamId: string;
  teamMemberships: DashboardTeamOption[];
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
  showAiNav,
  activeTeamId,
  teamMemberships,
  csrfToken,
  children,
}: DashboardShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader
        dashboardUser={{
          displayName,
          userEmail,
          avatarUrl,
          teamName,
          role,
          teamUiMode,
          activeTeamId,
          teamMemberships,
          csrfToken,
        }}
      />
      <main className="app-content flex-1">
        <div className="mx-auto max-w-[1440px] px-6 py-8 lg:px-10 lg:py-12">
          <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-14">
            <DashboardSidebar teamUiMode={teamUiMode} showAiNav={showAiNav} />
            <div className="space-y-8">{children}</div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
