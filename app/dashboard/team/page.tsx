import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { NoTeamCard } from "@/components/no-team-card";
import { TeamContextErrorCard } from "@/components/team-context-error-card";
import { TeamInviteCard } from "@/components/team-invite-card";
import {
  getDashboardBaseData,
  getDashboardBillingContext,
  getTeamMembersAndPendingInvites,
} from "@/lib/dashboard/server";
import { PLAN_CATALOG } from "@/lib/stripe/plans";

export default async function DashboardTeamPage() {
  const t = await getTranslations("DashboardTeamPage");
  const tCommon = await getTranslations("Common");
  const {
    supabase,
    user,
    teamContext,
    teamContextLoadFailed,
    teamMemberships,
    displayName,
    csrfToken,
  } =
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

  const billingContext = await getDashboardBillingContext(supabase, teamContext.teamId);
  if (!billingContext.isPaidPlan) {
    redirect("/dashboard/billing");
  }
  const teamUiMode = !billingContext.isPaidPlan
    ? "free"
    : billingContext.memberCount > 1
      ? "paid_team"
      : "paid_solo";
  const seatPriceLabel = billingContext.isPaidPlan && billingContext.effectivePlanKey
    ? PLAN_CATALOG.find((plan) => plan.key === billingContext.effectivePlanKey)?.priceLabel ?? null
    : null;
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
      teamUiMode={teamUiMode}
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
        <TeamInviteCard
          canInvite={
            billingContext.canInviteMembers &&
            (teamContext.role === "owner" || teamContext.role === "admin")
          }
          teamName={teamContext.teamName ?? tCommon("myTeam")}
          members={teamMembers}
          pendingInvites={pendingInvites}
          currentUserId={user.id}
          currentUserRole={teamContext.role}
          requireTeamNameOnFirstInvite={teamUiMode === "paid_solo"}
          seatPriceLabel={seatPriceLabel}
        />
      </section>
    </DashboardShell>
  );
}
