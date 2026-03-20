import { BillingActions } from "@/components/billing-actions";
import { DashboardShell } from "@/components/dashboard-shell";
import { NoTeamCard } from "@/components/no-team-card";
import { SupportEmailCard } from "@/components/support-email-card";
import { TeamContextErrorCard } from "@/components/team-context-error-card";
import { formatUtcDate } from "@/lib/date";
import { getPlanByPriceId } from "@/lib/stripe/config";
import { canManageTeamBilling } from "@/lib/team-context";
import {
  getDashboardBaseData,
  getLiveSubscription,
} from "@/lib/dashboard/server";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";

export default async function DashboardBillingPage() {
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
  const currentPlan = getPlanByPriceId(subscription?.stripe_price_id);
  const hasSubscription =
    subscription?.status !== undefined &&
    LIVE_SUBSCRIPTION_STATUSES.includes(subscription.status);
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
        <p className="text-sm text-slate-500 dark:text-slate-400">Billing</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">
          Manage your subscription
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Update plans, open the Stripe portal, and review your subscription status.
        </p>
      </header>

      <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          Current subscription
        </h2>
        {!subscription ? (
          <div className="mt-4 rounded-lg app-surface-subtle p-4 text-sm text-slate-600 dark:text-slate-200">
            No subscription yet. Choose a plan below to get started.
          </div>
        ) : (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Current plan</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {currentPlan?.name ?? "Unknown"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Status</dt>
              <dd className="uppercase tracking-wide text-slate-800 dark:text-slate-100">
                {subscription.status}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Seats</dt>
              <dd className="text-slate-800 dark:text-slate-100">{subscription.seat_quantity}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Period end</dt>
              <dd className="text-slate-800 dark:text-slate-100">
                {subscription.current_period_end
                  ? formatUtcDate(subscription.current_period_end)
                  : "N/A"}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section>
        <BillingActions
          currentPlanKey={currentPlan?.key ?? null}
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
