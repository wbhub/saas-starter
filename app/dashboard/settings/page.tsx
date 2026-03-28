import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { DashboardSettingsCard } from "@/components/dashboard-settings-card";
import { DangerZoneCard } from "@/components/danger-zone-card";
import { EmailSettingsCard } from "@/components/email-settings-card";
import { NotificationPreferencesCard } from "@/components/notification-preferences-card";
import { OrganizationSettingsCard } from "@/components/organization-settings-card";
import { SecuritySettingsCard } from "@/components/security-settings-card";
import {
  getDashboardNotificationPreferences,
  getDashboardShellData,
  getTeamMembers,
} from "@/lib/dashboard/server";

export default async function DashboardSettingsPage() {
  const t = await getTranslations("DashboardSettingsPage");
  const tCommon = await getTranslations("Common");
  const { supabase, user, profile, teamContext, billingContext, teamUiMode, csrfToken } =
    await getDashboardShellData();

  if (!teamContext || !billingContext || !teamUiMode) {
    return null;
  }

  const notificationPreferences = await getDashboardNotificationPreferences(supabase, user.id);
  const teamMembers =
    teamUiMode === "paid_team" ? await getTeamMembers(supabase, teamContext.teamId) : [];

  return (
    <>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("header.eyebrow")}
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">{t("header.title")}</h1>
        <p className="mt-2 text-base text-muted-foreground">{t("header.description")}</p>
      </div>

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

      {teamUiMode === "paid_team" ? (
        <section>
          <OrganizationSettingsCard
            teamName={teamContext.teamName ?? tCommon("myTeam")}
            members={teamMembers}
            currentUserId={user.id}
            currentUserRole={teamContext.role}
          />
        </section>
      ) : null}

      {teamUiMode === "paid_solo" ? (
        <section className="rounded-xl bg-card ring-1 ring-border p-6">
          <h2 className="text-lg font-semibold text-foreground">{t("inviteTeammates.title")}</h2>
          <p className="mt-2 text-muted-foreground">{t("inviteTeammates.description")}</p>
          <Link
            href="/dashboard/team"
            className="mt-4 inline-flex rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            {t("inviteTeammates.action")}
          </Link>
        </section>
      ) : null}

      <section>
        <SecuritySettingsCard csrfToken={csrfToken} />
      </section>

      <section>
        <DangerZoneCard email={user.email ?? null} csrfToken={csrfToken} />
      </section>
    </>
  );
}
