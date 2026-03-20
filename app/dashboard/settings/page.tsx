import { DashboardSettingsCard } from "@/components/dashboard-settings-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { NoTeamCard } from "@/components/no-team-card";
import { OrganizationSettingsCard } from "@/components/organization-settings-card";
import { SecuritySettingsCard } from "@/components/security-settings-card";
import {
  getDashboardBaseData,
  getTeamMembers,
} from "@/lib/dashboard/server";

export default async function DashboardSettingsPage() {
  const { supabase, user, profile, teamContext, displayName } = await getDashboardBaseData();

  if (!teamContext) {
    return (
      <main className="min-h-screen bg-[color:var(--background)] px-6 py-10 text-[color:var(--foreground)]">
        <NoTeamCard />
      </main>
    );
  }

  const teamMembers = await getTeamMembers(supabase, teamContext.teamId);

  return (
    <DashboardShell
      displayName={displayName}
      userEmail={user.email ?? null}
      teamName={teamContext.teamName}
      role={teamContext.role}
    >
      <header className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm sm:p-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">Settings</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">
          Account preferences
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Update your profile basics and review account-level preferences.
        </p>
      </header>

      <section>
        <DashboardSettingsCard fullName={profile?.full_name ?? null} email={user.email ?? null} />
      </section>

      <section>
        <OrganizationSettingsCard
          teamName={teamContext.teamName ?? "My Team"}
          members={teamMembers}
          currentUserId={user.id}
          currentUserRole={teamContext.role}
        />
      </section>

      <section>
        <SecuritySettingsCard />
      </section>
    </DashboardShell>
  );
}
