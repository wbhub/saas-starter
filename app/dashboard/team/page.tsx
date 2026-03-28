import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { TeamInviteCard } from "@/components/team-invite-card";
import { getDashboardShellData, getTeamMembersAndPendingInvites } from "@/lib/dashboard/server";
import { formatStaticUsdMonthlyLabel } from "@/lib/stripe/plan-price-display";
import { PLAN_CATALOG } from "@/lib/stripe/plans";

function TeamInviteSectionSkeleton() {
  return (
    <section className="rounded-xl bg-card ring-1 ring-border p-6">
      <div className="h-6 w-48 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-4 w-72 animate-pulse rounded bg-muted" />
      <div className="mt-6 h-40 animate-pulse rounded-xl bg-muted" />
    </section>
  );
}

async function TeamInviteSection({
  teamId,
  canInvite,
  teamName,
  currentUserId,
  currentUserRole,
  requireTeamNameOnFirstInvite,
  seatPriceLabel,
}: {
  teamId: string;
  canInvite: boolean;
  teamName: string;
  currentUserId: string;
  currentUserRole: "owner" | "admin" | "member";
  requireTeamNameOnFirstInvite: boolean;
  seatPriceLabel: string | null;
}) {
  const { supabase } = await getDashboardShellData();
  const { teamMembers, pendingInvites } = await getTeamMembersAndPendingInvites(supabase, teamId);

  return (
    <section>
      <TeamInviteCard
        canInvite={canInvite}
        teamName={teamName}
        members={teamMembers}
        pendingInvites={pendingInvites}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        requireTeamNameOnFirstInvite={requireTeamNameOnFirstInvite}
        seatPriceLabel={seatPriceLabel}
      />
    </section>
  );
}

export default async function DashboardTeamPage() {
  const t = await getTranslations("DashboardTeamPage");
  const tCommon = await getTranslations("Common");
  const tPricing = await getTranslations("Landing.pricing");
  const locale = await getLocale();
  const { user, teamContext, billingContext, teamUiMode } = await getDashboardShellData();

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
  const canInvite =
    billingContext.canInviteMembers &&
    (teamContext.role === "owner" || teamContext.role === "admin");
  const teamName = teamContext.teamName ?? tCommon("myTeam");

  return (
    <>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("header.eyebrow")}
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">{t("header.title")}</h1>
        <p className="mt-2 text-base text-muted-foreground">{t("header.description")}</p>
      </div>

      <Suspense fallback={<TeamInviteSectionSkeleton />}>
        <TeamInviteSection
          teamId={teamContext.teamId}
          canInvite={canInvite}
          teamName={teamName}
          currentUserId={user.id}
          currentUserRole={teamContext.role}
          requireTeamNameOnFirstInvite={teamUiMode === "paid_solo"}
          seatPriceLabel={seatPriceLabel}
        />
      </Suspense>
    </>
  );
}
