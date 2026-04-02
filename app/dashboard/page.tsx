import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, CreditCard, User } from "lucide-react";
import { DashboardPageSection } from "@/components/dashboard-page-section";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatUtcDate } from "@/lib/date";
import { type PlanKey, type SubscriptionStatus } from "@/lib/stripe/plans";
import { getDashboardShellData } from "@/lib/dashboard/server";
import { cn } from "@/lib/utils";

/** Same scale as `DashboardDetailField` / billing subscription rows */
const metaLabel = "text-xs font-medium leading-normal text-muted-foreground";
const metaValue = "text-sm font-medium leading-normal text-foreground";
const metaValueMono = cn(metaValue, "break-all font-mono");
const metaRow = "flex flex-col gap-0.5";

function subscriptionStatusLabel(translate: (key: string) => string, status: SubscriptionStatus) {
  return translate(`currentSubscription.statusLabels.${status}`);
}

function subscriptionStatusBadgeVariant(
  status: SubscriptionStatus,
): "success" | "destructive" | "secondary" {
  if (status === "active" || status === "trialing") {
    return "success";
  }
  if (status === "past_due" || status === "unpaid") {
    return "destructive";
  }
  return "secondary";
}

export default async function DashboardPage() {
  const t = await getTranslations();
  const tPlans = await getTranslations("Landing.pricing");
  const tBilling = await getTranslations("DashboardBillingPage");
  const locale = await getLocale();
  const { user, profile, teamContext, displayName, billingContext, teamUiMode } =
    await getDashboardShellData();

  if (!teamContext || !billingContext || !teamUiMode) {
    return null;
  }

  const {
    subscription,
    effectivePlanKey,
    isPaidPlan,
    billingInterval,
    memberCount,
    billingEnabled,
  } = billingContext;
  const currentPaidPlanKey: PlanKey | null =
    isPaidPlan && effectivePlanKey && effectivePlanKey !== "free" ? effectivePlanKey : null;

  return (
    <>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("DashboardPage.overview")}
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">
          {t("DashboardPage.welcome", { name: displayName })}
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          {t("DashboardPage.subtitle")}
        </p>
      </div>

      <div className="space-y-6">
        <DashboardPageSection
          icon={User}
          title={t("DashboardPage.account")}
          description={t("DashboardPage.accountDescription")}
        >
          <dl className="grid gap-5 sm:grid-cols-2">
            <div className={metaRow}>
              <dt className={metaLabel}>{t("DashboardPage.userId")}</dt>
              <dd className={metaValueMono}>{user.id}</dd>
            </div>
            {user.email ? (
              <div className={metaRow}>
                <dt className={metaLabel}>{t("DashboardPage.email")}</dt>
                <dd className={cn(metaValue, "break-all")}>{user.email}</dd>
              </div>
            ) : null}
            <div className={metaRow}>
              <dt className={metaLabel}>{t("DashboardPage.teamId")}</dt>
              <dd className={metaValueMono}>{teamContext.teamId}</dd>
            </div>
            {teamUiMode !== "free" ? (
              <>
                <div className={metaRow}>
                  <dt className={metaLabel}>{t("DashboardPage.team")}</dt>
                  <dd className={cn(metaValue, "min-w-0 truncate")}>
                    {teamContext.teamName ?? t("Common.myTeam")}
                  </dd>
                </div>
                <div className={metaRow}>
                  <dt className={metaLabel}>{t("DashboardPage.role")}</dt>
                  <dd>
                    <Badge variant="secondary">{t(`Common.teamRoles.${teamContext.role}`)}</Badge>
                  </dd>
                </div>
              </>
            ) : null}
            <div className={metaRow}>
              <dt className={metaLabel}>{t("DashboardPage.memberSince")}</dt>
              <dd className={metaValue}>{formatUtcDate(profile?.created_at ?? user.created_at)}</dd>
            </div>
          </dl>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            {t("DashboardPage.profileDevHint")}
          </p>
        </DashboardPageSection>

        <DashboardPageSection
          icon={CreditCard}
          title={t("DashboardPage.subscriptionSnapshot")}
          description={t("DashboardPage.subscriptionDescription")}
        >
          {!billingEnabled && !subscription ? (
            <div className="space-y-2">
              <p className="font-medium">{tBilling("billingDisabled.title")}</p>
              <p className="text-sm text-muted-foreground">
                {tBilling("billingDisabled.description")}
              </p>
            </div>
          ) : subscription ? (
            <>
              <dl className="grid gap-5 sm:grid-cols-2">
                <div className={metaRow}>
                  <dt className={metaLabel}>{t("DashboardPage.currentPlan")}</dt>
                  <dd className={metaValue}>
                    {currentPaidPlanKey
                      ? tPlans(`plans.${currentPaidPlanKey}.name`)
                      : t("DashboardPage.unknown")}
                  </dd>
                </div>
                <div className={metaRow}>
                  <dt className={metaLabel}>{t("DashboardPage.status")}</dt>
                  <dd>
                    <Badge variant={subscriptionStatusBadgeVariant(subscription.status)}>
                      {subscriptionStatusLabel(tBilling, subscription.status)}
                    </Badge>
                  </dd>
                </div>
                <div className={metaRow}>
                  <dt className={metaLabel}>{t("DashboardPage.seats")}</dt>
                  <dd className={cn(metaValue, "tabular-nums")}>{subscription.seat_quantity}</dd>
                </div>
                <div className={metaRow}>
                  <dt className={metaLabel}>{t("DashboardPage.teamMembers")}</dt>
                  <dd className={cn(metaValue, "tabular-nums")}>{memberCount}</dd>
                </div>
                <div className={metaRow}>
                  <dt className={metaLabel}>{tBilling("currentSubscription.billingInterval")}</dt>
                  <dd className={metaValue}>
                    {billingInterval === "year"
                      ? tBilling("currentSubscription.annual")
                      : billingInterval === "month"
                        ? tBilling("currentSubscription.monthly")
                        : tBilling("currentSubscription.notAvailable")}
                  </dd>
                </div>
                <div className={metaRow}>
                  <dt className={metaLabel}>{tBilling("currentSubscription.periodEnd")}</dt>
                  <dd className={metaValue}>
                    {subscription.current_period_end
                      ? formatUtcDate(subscription.current_period_end, undefined, locale)
                      : tBilling("currentSubscription.notAvailable")}
                  </dd>
                </div>
                <div className={metaRow}>
                  <dt className={metaLabel}>{t("DashboardPage.stripePriceId")}</dt>
                  <dd className={metaValueMono}>{subscription.stripe_price_id ?? "—"}</dd>
                </div>
              </dl>
              {subscription.cancel_at_period_end ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  {tBilling("currentSubscription.cancelScheduled")}
                </p>
              ) : null}
              <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                {t("DashboardPage.subscriptionDevHint")}
              </p>
            </>
          ) : effectivePlanKey === "free" ? (
            <div className="space-y-4">
              <div>
                <p className="font-medium">{t("DashboardPage.currentPlanFree")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("DashboardPage.visitBillingUpgrade")}
                </p>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("DashboardPage.subscriptionFreeDevHint")}
              </p>
              <Link
                href="/dashboard/billing"
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "inline-flex items-center gap-1.5 text-sm transition-colors",
                )}
              >
                Upgrade
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("DashboardPage.noActiveSubscription")}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("DashboardPage.subscriptionFreeDevHint")}
              </p>
            </div>
          )}
        </DashboardPageSection>
      </div>
    </>
  );
}
