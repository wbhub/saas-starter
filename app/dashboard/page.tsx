import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUtcDate } from "@/lib/date";
import { type PlanKey } from "@/lib/stripe/plans";
import { getDashboardShellData } from "@/lib/dashboard/server";

export default async function DashboardPage() {
  const t = await getTranslations();
  const tPlans = await getTranslations("Landing.pricing");
  const { user, profile, teamContext, displayName, billingContext, teamUiMode } =
    await getDashboardShellData();

  if (!teamContext || !billingContext || !teamUiMode) {
    return null;
  }

  const { subscription, effectivePlanKey, memberCount, isPaidPlan } = billingContext;
  const currentPaidPlanKey: PlanKey | null =
    isPaidPlan && effectivePlanKey && effectivePlanKey !== "free" ? effectivePlanKey : null;

  return (
    <>
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("DashboardPage.welcome", { name: displayName })}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">{t("DashboardPage.subtitle")}</p>
      </div>

      {/* Account & Subscription */}
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("DashboardPage.account")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
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
                      <Badge variant="secondary" className="capitalize">
                        {teamContext.role}
                      </Badge>
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
              <dl className="space-y-4">
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
                    <Badge variant="secondary" className="uppercase">
                      {subscription.status}
                    </Badge>
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
    </>
  );
}
