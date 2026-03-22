import type { ReactNode } from "react";
import type { TeamRole } from "@/lib/team-context";
import type { DashboardTeamOption } from "@/lib/dashboard/server";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

type DashboardShellProps = {
  displayName: string;
  userEmail: string | null;
  teamName: string | null;
  role: TeamRole;
  teamUiMode: "free" | "paid_solo" | "paid_team";
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
  activeTeamId,
  teamMemberships,
  csrfToken,
  children,
}: DashboardShellProps) {
  return (
    <main className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6">
          <DashboardSidebar
            displayName={displayName}
            userEmail={userEmail}
            teamName={teamName}
            role={role}
            teamUiMode={teamUiMode}
            activeTeamId={activeTeamId}
            teamMemberships={teamMemberships}
            csrfToken={csrfToken}
          />
          <div className="space-y-4">{children}</div>
        </div>
      </div>
    </main>
  );
}
