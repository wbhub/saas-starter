import { getTranslations } from "next-intl/server";
import { DashboardSettingsCard } from "@/components/dashboard-settings-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { DangerZoneCard } from "@/components/danger-zone-card";
import { EmailSettingsCard } from "@/components/email-settings-card";
import { NoTeamCard } from "@/components/no-team-card";
import { NotificationPreferencesCard } from "@/components/notification-preferences-card";
import { OrganizationSettingsCard } from "@/components/organization-settings-card";
import { SecuritySettingsCard } from "@/components/security-settings-card";
import { TeamContextErrorCard } from "@/components/team-context-error-card";
import {
  getDashboardBaseData,
  getTeamMembers,
} from "@/lib/dashboard/server";

export default async function DashboardSettingsPage() {
  const t = await getTranslations("DashboardSettingsPage");
  const tCommon = await getTranslations("Common");
  const {
    supabase,
    user,
    profile,
    teamContext,
    teamContextLoadFailed,
    teamMemberships,
    notificationPreferences,
    displayName,
    csrfToken,
  } = await getDashboardBaseData();

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

  const teamMembers = await getTeamMembers(supabase, teamContext.teamId);

  return (
    <DashboardShell
      displayName={displayName}
      userEmail={user.email ?? null}
      teamName={teamContext.teamName}
      role={teamContext.role}
      activeTeamId={teamContext.teamId}
      teamMemberships={teamMemberships}
      csrfToken={csrfToken}
    >
      <header className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm sm:p-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("header.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">
          {t("header.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t("header.description")}
        </p>
      </header>

      <section>
        <DashboardSettingsCard
          userId={user.id}
          fullName={profile?.full_name ?? null}
          avatarUrl={profile?.avatar_url ?? null}
          email={user.email ?? null}
          csrfToken={csrfToken}
        />
      </section>

      <section>
        <EmailSettingsCard email={user.email ?? null} csrfToken={csrfToken} />
      </section>

      <section>
        <NotificationPreferencesCard
          marketingEmails={notificationPreferences.marketing_emails}
          productUpdates={notificationPreferences.product_updates}
          securityAlerts={notificationPreferences.security_alerts}
          csrfToken={csrfToken}
        />
      </section>

      <section>
        <OrganizationSettingsCard
          teamName={teamContext.teamName ?? tCommon("myTeam")}
          members={teamMembers}
          currentUserId={user.id}
          currentUserRole={teamContext.role}
        />
      </section>

      <section>
        <SecuritySettingsCard csrfToken={csrfToken} />
      </section>

      <section>
        <DangerZoneCard email={user.email ?? null} csrfToken={csrfToken} />
      </section>
    </DashboardShell>
  );
}
