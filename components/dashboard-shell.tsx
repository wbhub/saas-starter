import type { ReactNode } from "react";
import type { TeamRole } from "@/lib/team-context";
import type { DashboardTeamOption } from "@/lib/dashboard/server";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

type DashboardShellProps = {
  displayName: string;
  userEmail: string | null;
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
    <div className="flex min-h-screen flex-col bg-[color:var(--background)] text-[color:var(--foreground)]">
      <SiteHeader isLoggedIn={true} />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
            <DashboardSidebar
              displayName={displayName}
              userEmail={userEmail}
              teamName={teamName}
              role={role}
              teamUiMode={teamUiMode}
              showAiNav={showAiNav}
              activeTeamId={activeTeamId}
              teamMemberships={teamMemberships}
              csrfToken={csrfToken}
            />
            <div className="space-y-6">{children}</div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
