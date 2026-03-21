import { getLocale, getTranslations } from "next-intl/server";
import { BillingActions } from "@/components/billing-actions";
import { DashboardShell } from "@/components/dashboard-shell";
import { NoTeamCard } from "@/components/no-team-card";
import { SupportEmailCard } from "@/components/support-email-card";
import { TeamContextErrorCard } from "@/components/team-context-error-card";
import { resolveEffectivePlanKey } from "@/lib/billing/effective-plan";
import { formatUtcDate } from "@/lib/date";
import { canManageTeamBilling } from "@/lib/team-context";
import {
  getDashboardBaseData,
  getLiveSubscription,
} from "@/lib/dashboard/server";
import { PLAN_LABELS } from "@/lib/stripe/plans";

export default async function DashboardBillingPage() {
  const t = await getTranslations("DashboardBillingPage");
  const locale = await getLocale();
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

  const subscription = await getLiveSubscription(supabase, teamContext.teamId);
  const effectivePlanKey = resolveEffectivePlanKey(subscription);
  const currentPaidPlanKey =
    effectivePlanKey && effectivePlanKey !== "free" ? effectivePlanKey : null;
  const hasSubscription = Boolean(subscription);
  const canManageBilling = canManageTeamBilling(teamContext.role);

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
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("header.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">
          {t("header.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t("header.description")}
        </p>
      </header>

      <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          {t("currentSubscription.title")}
        </h2>
        {subscription ? (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{t("currentSubscription.currentPlan")}</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {currentPaidPlanKey ? PLAN_LABELS[currentPaidPlanKey] : t("currentSubscription.unknown")}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{t("currentSubscription.status")}</dt>
              <dd className="uppercase tracking-wide text-slate-800 dark:text-slate-100">
                {subscription.status}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{t("currentSubscription.seats")}</dt>
              <dd className="text-slate-800 dark:text-slate-100">{subscription.seat_quantity}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{t("currentSubscription.periodEnd")}</dt>
              <dd className="text-slate-800 dark:text-slate-100">
                {subscription.current_period_end
                  ? formatUtcDate(subscription.current_period_end, undefined, locale)
                  : t("currentSubscription.notAvailable")}
              </dd>
            </div>
          </dl>
        ) : effectivePlanKey === "free" ? (
          <div className="mt-4 rounded-lg app-surface-subtle p-4 text-sm text-slate-600 dark:text-slate-200">
            <p className="font-medium text-slate-900 dark:text-slate-100">{t("currentSubscription.currentPlanFree")}</p>
            <p className="mt-1">{t("currentSubscription.upgradeHint")}</p>
          </div>
        ) : (
          <div className="mt-4 rounded-lg app-surface-subtle p-4 text-sm text-slate-600 dark:text-slate-200">
            {t("currentSubscription.noSubscription")}
          </div>
        )}
      </section>

      <section>
        <BillingActions
          currentPlanKey={currentPaidPlanKey}
          hasSubscription={hasSubscription}
          canManageBilling={canManageBilling}
        />
      </section>

      <section>
        <SupportEmailCard />
      </section>
    </DashboardShell>
  );
}
