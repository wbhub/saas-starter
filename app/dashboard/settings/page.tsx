import { getTranslations } from "next-intl/server";
import { DashboardSettingsCard } from "@/components/dashboard-settings-card";
import { DangerZoneCard } from "@/components/danger-zone-card";
import { EmailSettingsCard } from "@/components/email-settings-card";
import { OrganizationSettingsCard } from "@/components/organization-settings-card";
import { SecuritySettingsCard } from "@/components/security-settings-card";
import { getDashboardShellData, getTeamMembers } from "@/lib/dashboard/server";

export default async function DashboardSettingsPage() {
  const t = await getTranslations("DashboardSettingsPage");
  const tCommon = await getTranslations("Common");
  const { supabase, user, profile, teamContext, billingContext, teamUiMode, csrfToken } =
    await getDashboardShellData();

  if (!teamContext || !billingContext || !teamUiMode) {
    return null;
  }

  const teamMembers =
    teamUiMode === "paid_team" ? await getTeamMembers(supabase, teamContext.teamId) : [];

  return (
    <>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("header.eyebrow")}
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">{t("header.title")}</h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">{t("header.description")}</p>
      </div>

      <div className="space-y-6">
        <DashboardSettingsCard
          userId={user.id}
          fullName={profile?.full_name ?? null}
          avatarUrl={profile?.avatar_url ?? null}
          email={user.email ?? null}
        />

        <EmailSettingsCard email={user.email ?? null} csrfToken={csrfToken} />

        {teamUiMode === "paid_team" ? (
          <OrganizationSettingsCard
            teamName={teamContext.teamName ?? tCommon("myTeam")}
            members={teamMembers}
            currentUserId={user.id}
            currentUserRole={teamContext.role}
          />
        ) : null}

        <SecuritySettingsCard csrfToken={csrfToken} />

        <DangerZoneCard email={user.email ?? null} csrfToken={csrfToken} />
      </div>
    </>
  );
}
