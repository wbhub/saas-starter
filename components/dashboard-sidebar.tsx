"use client";

import { DashboardNav, type DashboardTeamUiMode } from "@/components/dashboard-nav";

type DashboardSidebarProps = {
  teamUiMode: DashboardTeamUiMode;
  showAiNav: boolean;
};

export function DashboardSidebar({ teamUiMode, showAiNav }: DashboardSidebarProps) {
  return (
    <aside className="hidden lg:sticky lg:top-8 lg:block lg:self-start">
      <DashboardNav teamUiMode={teamUiMode} showAiNav={showAiNav} className="-mx-2.5" />
    </aside>
  );
}
