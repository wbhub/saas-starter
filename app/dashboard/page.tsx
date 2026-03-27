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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
      <main className="min-h-screen bg-background px-6 py-10 text-foreground">
        <TeamContextErrorCard />
      </main>
    );
  }

  if (!teamContext) {
    return (
      <main className="min-h-screen bg-background px-6 py-10 text-foreground">
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
  }> = [];

  if (aiUiGate.isVisibleInUi) {
    quickNavItems.push({
      label: t("DashboardPage.ai"),
      href: "/dashboard/ai",
      icon: Sparkles,
      description: "Chat with AI assistants",
    });
  }

  quickNavItems.push(
    {
      label: t("DashboardPage.billing"),
      href: "/dashboard/billing",
      icon: CreditCard,
      description: "Manage your plan",
    },
    {
      label: t("DashboardPage.usage"),
      href: "/dashboard/usage",
      icon: BarChart3,
      description: "View usage analytics",
    },
    {
      label: t("DashboardPage.settings"),
      href: "/dashboard/settings",
      icon: Settings,
      description: "Configure your account",
    },
  );

  if (teamUiMode !== "free") {
    quickNavItems.splice(quickNavItems.length - 1, 0, {
      label: teamNavLabel,
      href: "/dashboard/team",
      icon: teamUiMode === "paid_solo" ? UserPlus : Users,
      description: "Manage your team",
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
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("DashboardPage.welcome", { name: displayName })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("DashboardPage.navigate")}
        </p>
      </div>

      {/* Account & Subscription */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("DashboardPage.account")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t("DashboardPage.userId")}</dt>
                <dd className="max-w-[180px] truncate font-mono text-xs">{user.id}</dd>
              </div>
              {teamUiMode !== "free" ? (
                <>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">{t("DashboardPage.team")}</dt>
                    <dd className="truncate font-medium">
                      {teamContext.teamName ?? t("Common.myTeam")}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">{t("DashboardPage.role")}</dt>
                    <dd>
                      <Badge variant="secondary" className="capitalize">{teamContext.role}</Badge>
                    </dd>
                  </div>
                </>
              ) : null}
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t("DashboardPage.memberSince")}</dt>
                <dd>{formatUtcDate(profile?.created_at ?? user.created_at)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("DashboardPage.subscriptionSnapshot")}</CardTitle>
          </CardHeader>
          <CardContent>
            {subscription ? (
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{t("DashboardPage.currentPlan")}</dt>
                  <dd className="font-medium">
                    {currentPaidPlanKey
                      ? tPlans(`plans.${currentPaidPlanKey}.name`)
                      : t("DashboardPage.unknown")}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{t("DashboardPage.status")}</dt>
                  <dd>
                    <Badge variant="secondary" className="uppercase">{subscription.status}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{t("DashboardPage.seats")}</dt>
                  <dd className="font-medium">{subscription.seat_quantity}</dd>
                </div>
              </dl>
            ) : effectivePlanKey === "free" ? (
              <div className="space-y-3">
                <div>
                  <p className="font-medium">{t("DashboardPage.currentPlanFree")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("DashboardPage.visitBillingUpgrade")}
                  </p>
                </div>
                <Link
                  href="/dashboard/billing"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
                >
                  Upgrade
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("DashboardPage.noActiveSubscription")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick navigation */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {quickNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-3 rounded-xl p-3 ring-1 ring-border transition-colors hover:bg-muted"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </DashboardShell>
  );
}
