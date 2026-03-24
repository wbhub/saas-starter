import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NoTeamCard } from "@/components/no-team-card";
import { TeamContextErrorCard } from "@/components/team-context-error-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { formatUtcDate } from "@/lib/date";
import { type PlanKey } from "@/lib/stripe/plans";
import {
  getDashboardAiUiGate,
  getDashboardBaseData,
  getDashboardBillingContext,
} from "@/lib/dashboard/server";

export default async function DashboardPage() {
  const t = await getTranslations();
  const tPlans = await getTranslations("Landing.pricing");
  const {
    supabase,
    user,
    profile,
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

  const [billingContext, aiUiGate] = await Promise.all([
    getDashboardBillingContext(supabase, teamContext.teamId),
    getDashboardAiUiGate(supabase, teamContext.teamId),
  ]);
  const { subscription, effectivePlanKey, memberCount, isPaidPlan } = billingContext;
  const currentPaidPlanKey: PlanKey | null =
    isPaidPlan && effectivePlanKey && effectivePlanKey !== "free" ? effectivePlanKey : null;
  const teamUiMode = !isPaidPlan ? "free" : memberCount > 1 ? "paid_team" : "paid_solo";
  const teamNavLabel =
    teamUiMode === "paid_solo" ? t("DashboardPage.inviteTeammates") : t("DashboardPage.teamNav");

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
      <header className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm sm:p-6">
        <p className="text-sm text-muted-foreground">{t("DashboardPage.overview")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          {t("DashboardPage.welcome", { name: displayName })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("DashboardPage.navigate")}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">{t("DashboardPage.account")}</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t("DashboardPage.userId")}</dt>
              <dd className="max-w-[220px] truncate text-foreground">{user.id}</dd>
            </div>
            {teamUiMode !== "free" ? (
              <>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{t("DashboardPage.team")}</dt>
                  <dd className="max-w-[220px] truncate text-foreground">
                    {teamContext.teamName ?? t("Common.myTeam")}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{t("DashboardPage.role")}</dt>
                  <dd className="text-foreground capitalize">{teamContext.role}</dd>
                </div>
              </>
            ) : null}
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t("DashboardPage.memberSince")}</dt>
              <dd className="text-foreground">
                {formatUtcDate(profile?.created_at ?? user.created_at)}
              </dd>
            </div>
          </dl>
        </article>

        <article className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            {t("DashboardPage.subscriptionSnapshot")}
          </h2>
          {subscription ? (
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t("DashboardPage.currentPlan")}</dt>
                <dd className="font-medium text-foreground">
                  {currentPaidPlanKey
                    ? tPlans(`plans.${currentPaidPlanKey}.name`)
                    : t("DashboardPage.unknown")}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t("DashboardPage.status")}</dt>
                <dd className="uppercase tracking-wide text-foreground">{subscription.status}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t("DashboardPage.seats")}</dt>
                <dd className="text-foreground">{subscription.seat_quantity}</dd>
              </div>
            </dl>
          ) : effectivePlanKey === "free" ? (
            <div className="mt-4 rounded-lg app-surface-subtle p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{t("DashboardPage.currentPlanFree")}</p>
              <p className="mt-1">{t("DashboardPage.visitBillingUpgrade")}</p>
            </div>
          ) : (
            <div className="mt-4 rounded-lg app-surface-subtle p-4 text-sm text-muted-foreground">
              {t("DashboardPage.noActiveSubscription")}
            </div>
          )}
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {aiUiGate.isVisibleInUi ? (
          <Link
            href="/dashboard/ai"
            className="rounded-xl border app-border-subtle app-surface p-4 text-sm text-muted-foreground shadow-sm hover:bg-surface-hover"
          >
            {t("DashboardPage.ai")}
          </Link>
        ) : null}
        <Link
          href="/dashboard/billing"
          className="rounded-xl border app-border-subtle app-surface p-4 text-sm text-muted-foreground shadow-sm hover:bg-surface-hover"
        >
          {t("DashboardPage.billing")}
        </Link>
        {teamUiMode !== "free" ? (
          <Link
            href="/dashboard/team"
            className="rounded-xl border app-border-subtle app-surface p-4 text-sm text-muted-foreground shadow-sm hover:bg-surface-hover"
          >
            {teamNavLabel}
          </Link>
        ) : null}
        <Link
          href="/dashboard/usage"
          className="rounded-xl border app-border-subtle app-surface p-4 text-sm text-muted-foreground shadow-sm hover:bg-surface-hover"
        >
          {t("DashboardPage.usage")}
        </Link>
        <Link
          href="/dashboard/settings"
          className="rounded-xl border app-border-subtle app-surface p-4 text-sm text-muted-foreground shadow-sm hover:bg-surface-hover"
        >
          {t("DashboardPage.settings")}
        </Link>
      </section>
    </DashboardShell>
  );
}
