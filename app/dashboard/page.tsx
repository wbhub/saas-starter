import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Sparkles,
  CreditCard,
  Users,
  UserPlus,
  BarChart3,
  Settings,
  ArrowRight,
  User,
  Calendar,
  Shield,
  Zap,
} from "lucide-react";
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

  const quickNavItems: Array<{
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
    gradient: string;
  }> = [];

  if (aiUiGate.isVisibleInUi) {
    quickNavItems.push({
      label: t("DashboardPage.ai"),
      href: "/dashboard/ai",
      icon: Sparkles,
      description: "Chat with AI assistants",
      gradient: "from-violet-500/10 to-purple-500/10",
    });
  }

  quickNavItems.push(
    {
      label: t("DashboardPage.billing"),
      href: "/dashboard/billing",
      icon: CreditCard,
      description: "Manage your plan",
      gradient: "from-emerald-500/10 to-teal-500/10",
    },
    {
      label: t("DashboardPage.usage"),
      href: "/dashboard/usage",
      icon: BarChart3,
      description: "View usage analytics",
      gradient: "from-blue-500/10 to-cyan-500/10",
    },
    {
      label: t("DashboardPage.settings"),
      href: "/dashboard/settings",
      icon: Settings,
      description: "Configure your account",
      gradient: "from-orange-500/10 to-amber-500/10",
    },
  );

  if (teamUiMode !== "free") {
    quickNavItems.splice(quickNavItems.length - 1, 0, {
      label: teamNavLabel,
      href: "/dashboard/team",
      icon: teamUiMode === "paid_solo" ? UserPlus : Users,
      description: "Manage your team",
      gradient: "from-pink-500/10 to-rose-500/10",
    });
  }

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
      {/* Welcome banner */}
      <header className="relative overflow-hidden rounded-2xl border app-border-subtle bg-gradient-to-br from-indigo-500/5 via-transparent to-emerald-500/5 p-6 shadow-sm sm:p-8">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-500/5 to-emerald-400/5 blur-3xl" />
        <div className="relative">
          <p className="text-sm font-medium text-accent">{t("DashboardPage.overview")}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            {t("DashboardPage.welcome", { name: displayName })}
          </h1>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            {t("DashboardPage.navigate")}
          </p>
        </div>
      </header>

      {/* Account & Subscription cards */}
      <section className="grid gap-6 md:grid-cols-2">
        <article className="rounded-2xl border app-border-subtle app-surface p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <User className="h-4.5 w-4.5 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">{t("DashboardPage.account")}</h2>
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg app-surface-subtle px-3 py-2">
              <dt className="text-muted-foreground">{t("DashboardPage.userId")}</dt>
              <dd className="max-w-[200px] truncate font-mono text-xs text-foreground">{user.id}</dd>
            </div>
            {teamUiMode !== "free" ? (
              <>
                <div className="flex items-center justify-between rounded-lg app-surface-subtle px-3 py-2">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {t("DashboardPage.team")}
                  </dt>
                  <dd className="max-w-[200px] truncate font-medium text-foreground">
                    {teamContext.teamName ?? t("Common.myTeam")}
                  </dd>
                </div>
                <div className="flex items-center justify-between rounded-lg app-surface-subtle px-3 py-2">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <Shield className="h-3.5 w-3.5" />
                    {t("DashboardPage.role")}
                  </dt>
                  <dd className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium capitalize text-accent">
                    {teamContext.role}
                  </dd>
                </div>
              </>
            ) : null}
            <div className="flex items-center justify-between rounded-lg app-surface-subtle px-3 py-2">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                {t("DashboardPage.memberSince")}
              </dt>
              <dd className="text-foreground">
                {formatUtcDate(profile?.created_at ?? user.created_at)}
              </dd>
            </div>
          </dl>
        </article>

        <article className="rounded-2xl border app-border-subtle app-surface p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
              <Zap className="h-4.5 w-4.5 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {t("DashboardPage.subscriptionSnapshot")}
            </h2>
          </div>
          {subscription ? (
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg app-surface-subtle px-3 py-2">
                <dt className="text-muted-foreground">{t("DashboardPage.currentPlan")}</dt>
                <dd className="font-semibold text-foreground">
                  {currentPaidPlanKey
                    ? tPlans(`plans.${currentPaidPlanKey}.name`)
                    : t("DashboardPage.unknown")}
                </dd>
              </div>
              <div className="flex items-center justify-between rounded-lg app-surface-subtle px-3 py-2">
                <dt className="text-muted-foreground">{t("DashboardPage.status")}</dt>
                <dd className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  {subscription.status}
                </dd>
              </div>
              <div className="flex items-center justify-between rounded-lg app-surface-subtle px-3 py-2">
                <dt className="text-muted-foreground">{t("DashboardPage.seats")}</dt>
                <dd className="font-medium text-foreground">{subscription.seat_quantity}</dd>
              </div>
            </dl>
          ) : effectivePlanKey === "free" ? (
            <div className="mt-5 rounded-xl bg-gradient-to-br from-indigo-500/5 to-emerald-500/5 p-4 text-sm">
              <p className="font-semibold text-foreground">{t("DashboardPage.currentPlanFree")}</p>
              <p className="mt-1 text-muted-foreground">{t("DashboardPage.visitBillingUpgrade")}</p>
              <Link
                href="/dashboard/billing"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
              >
                Upgrade now
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="mt-5 rounded-xl app-surface-subtle p-4 text-sm text-muted-foreground">
              {t("DashboardPage.noActiveSubscription")}
            </div>
          )}
        </article>
      </section>

      {/* Quick navigation cards */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Quick actions
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group relative overflow-hidden rounded-2xl border app-border-subtle app-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 transition-opacity group-hover:opacity-100`}
                />
                <div className="relative flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl app-surface-subtle transition-colors group-hover:bg-accent/10">
                    <Icon className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-accent" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{item.label}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <ArrowRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:text-accent group-hover:opacity-100" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </DashboardShell>
  );
}
