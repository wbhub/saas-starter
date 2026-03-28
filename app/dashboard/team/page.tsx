import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { TeamInviteCard } from "@/components/team-invite-card";
import { getDashboardShellData, getTeamMembersAndPendingInvites } from "@/lib/dashboard/server";
import { formatStaticUsdMonthlyLabel } from "@/lib/stripe/plan-price-display";
import { PLAN_CATALOG } from "@/lib/stripe/plans";

export default async function DashboardTeamPage() {
  const t = await getTranslations("DashboardTeamPage");
  const tCommon = await getTranslations("Common");
  const tPricing = await getTranslations("Landing.pricing");
  const locale = await getLocale();
  const { supabase, user, teamContext, billingContext, teamUiMode } = await getDashboardShellData();

  if (!teamContext || !billingContext || !teamUiMode) {
    return null;
  }

  if (!billingContext.isPaidPlan) {
    redirect("/dashboard/billing");
  }
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
    <>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("header.eyebrow")}
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">{t("header.title")}</h1>
        <p className="mt-2 text-base text-muted-foreground">{t("header.description")}</p>
      </div>

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
    </>
  );
}
