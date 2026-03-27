import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { NoTeamCard } from "@/components/no-team-card";
import { TeamContextErrorCard } from "@/components/team-context-error-card";
import { TeamInviteCard } from "@/components/team-invite-card";
import {
  getDashboardAiUiGate,
  getDashboardBaseData,
  getDashboardBillingContext,
  getTeamMembersAndPendingInvites,
} from "@/lib/dashboard/server";
import { formatStaticUsdMonthlyLabel } from "@/lib/stripe/plan-price-display";
import { PLAN_CATALOG } from "@/lib/stripe/plans";

export default async function DashboardTeamPage() {
  const t = await getTranslations("DashboardTeamPage");
  const tCommon = await getTranslations("Common");
  const tPricing = await getTranslations("Landing.pricing");
  const locale = await getLocale();
  const {
    supabase,
    user,
    teamContext,
    teamContextLoadFailed,
    teamMemberships,
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

  const billingContext = await getDashboardBillingContext(supabase, teamContext.teamId);
  if (!billingContext.isPaidPlan) {
    redirect("/dashboard/billing");
  }
  const aiUiGate = await getDashboardAiUiGate(supabase, teamContext.teamId);
  const teamUiMode = !billingContext.isPaidPlan
    ? "free"
    : billingContext.memberCount > 1
      ? "paid_team"
      : "paid_solo";
  const seatPlan =
    billingContext.isPaidPlan && billingContext.effectivePlanKey
      ? (PLAN_CATALOG.find((plan) => plan.key === billingContext.effectivePlanKey) ?? null)
      : null;
  const seatPriceLabel = seatPlan
    ? formatStaticUsdMonthlyLabel(seatPlan.amountMonthly, locale, tPricing("priceSuffix.month"))
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
      showAiNav={aiUiGate.isVisibleInUi}
      activeTeamId={teamContext.teamId}
      teamMemberships={teamMemberships}
      csrfToken={csrfToken}
    >
      <header className="relative overflow-hidden rounded-2xl border app-border-subtle bg-gradient-to-br from-pink-500/5 via-transparent to-rose-500/5 p-6 shadow-sm sm:p-8">
        <p className="text-sm font-medium text-accent">{t("header.eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{t("header.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("header.description")}</p>
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
