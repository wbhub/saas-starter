import { DashboardShell } from "@/components/dashboard-shell";
import { NoTeamCard } from "@/components/no-team-card";
import { TeamContextErrorCard } from "@/components/team-context-error-card";
import { TeamInviteCard } from "@/components/team-invite-card";
import {
  getDashboardBaseData,
  getTeamMembersAndPendingInvites,
} from "@/lib/dashboard/server";

export default async function DashboardTeamPage() {
  const { supabase, user, teamContext, teamContextLoadFailed, teamMemberships, displayName } =
    await getDashboardBaseData();

  if (teamContextLoadFailed) {
    return (
      <main className="min-h-screen bg-[color:var(--background)] px-6 py-10 text-[color:var(--foreground)]">
        <TeamContextErrorCard />
      </main>
    );
  }

  if (!teamContext) {
    return (
      <main className="min-h-screen bg-[color:var(--background)] px-6 py-10 text-[color:var(--foreground)]">
        <NoTeamCard />
      </main>
    );
  }

  const { teamMembers, pendingInvites } = await getTeamMembersAndPendingInvites(
    supabase,
    teamContext.teamId,
  );

  return (
    <DashboardShell
      displayName={displayName}
      userEmail={user.email ?? null}
      teamName={teamContext.teamName}
      role={teamContext.role}
      activeTeamId={teamContext.teamId}
      teamMemberships={teamMemberships}
    >
      <header className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm sm:p-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">Team</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">
          Team access and invites
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Manage members, roles, and invitation links for your workspace.
        </p>
      </header>

      <section>
        <TeamInviteCard
          canInvite={teamContext.role === "owner" || teamContext.role === "admin"}
          teamName={teamContext.teamName ?? "My Team"}
          members={teamMembers}
          pendingInvites={pendingInvites}
          currentUserId={user.id}
          currentUserRole={teamContext.role}
        />
      </section>
    </DashboardShell>
  );
}
