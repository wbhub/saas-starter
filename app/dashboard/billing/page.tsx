import { Suspense, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  CreditCard,
  LayoutGrid,
  Receipt,
  Sparkles,
  Users,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { AiUsageCard, AiUsageCardSkeleton } from "@/components/ai-usage-card";
import { BillingActions } from "@/components/billing-actions";
import { Badge } from "@/components/ui/badge";
import { formatUtcDate } from "@/lib/date";
import { formatStaticUsdMonthlyLabel } from "@/lib/stripe/plan-price-display";
import { canManageTeamBilling } from "@/lib/team-context";
import { getDashboardShellData } from "@/lib/dashboard/server";
import type { PlanKey, SubscriptionStatus } from "@/lib/stripe/plans";
import { syncCheckoutSuccessForTeam } from "@/lib/stripe/checkout-success";
import { getPublicPricingCatalog } from "@/lib/stripe/public-pricing";
import { createClient } from "@/lib/supabase/server";
import { getCachedTeamContextForUser } from "@/lib/team-context-cache";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import {
  DashboardPageSection,
  dashboardPageSectionClass,
} from "@/components/dashboard-page-section";

/** Matches settings and `AiUsageCard` / `AiUsageCardSkeleton` outer shell for visual consistency. */
const billingSectionClass = dashboardPageSectionClass;

function subscriptionStatusLabel(translate: (key: string) => string, status: SubscriptionStatus) {
  return translate(`currentSubscription.statusLabels.${status}`);
}

type DashboardBillingPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function getFirstSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function subscriptionStatusBadgeVariant(
  status: SubscriptionStatus,
): "success" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "success";
    case "trialing":
      return "secondary";
    case "past_due":
    case "unpaid":
      return "destructive";
    default:
      return "outline";
  }
}

function SubscriptionDetail({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/80 ring-1 ring-border">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5 leading-tight">
        <p className="text-xs font-medium leading-normal text-muted-foreground">{label}</p>
        <div className="text-sm font-medium leading-normal text-foreground">{children}</div>
      </div>
    </div>
  );
}

export default async function DashboardBillingPage({
  searchParams,
}: DashboardBillingPageProps = {}) {
  const t = await getTranslations("DashboardBillingPage");
  const tUsage = await getTranslations("DashboardUsagePage");
  const tPlanCopy = await getTranslations("Landing.pricing");
  const locale = await getLocale();
  const priceSuffixMonth = tPlanCopy("priceSuffix.month");
  const catalogSeatPrice = (amountMonthly: number) =>
    formatStaticUsdMonthlyLabel(amountMonthly, locale, priceSuffixMonth);
  const resolvedSearchParams = (await searchParams) ?? {};
  const checkoutStatus = getFirstSearchParamValue(resolvedSearchParams.checkout);
  const sessionId = getFirstSearchParamValue(resolvedSearchParams.session_id) ?? null;

  // Eagerly sync the subscription from the Stripe session before loading
  // billing data, so the page reflects the new plan immediately. The webhook
  // remains authoritative; this is best-effort. syncSubscription inside
  // syncCheckoutSuccessForTeam invalidates the dashboard team snapshot cache,
  // so getDashboardShellData below reads fresh data.
  if (checkoutStatus === "success" && sessionId) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const teamCtx = await getCachedTeamContextForUser(supabase, user.id);
        if (teamCtx) {
          await syncCheckoutSuccessForTeam(teamCtx.teamId, { sessionId });
        }
      }
    } catch (error) {
      logger.warn("Eager checkout sync failed on billing page; webhook will handle it.", {
        sessionId,
        error,
      });
    }
  }

  const { teamContext, billingContext, teamUiMode, aiUiGate } = await getDashboardShellData();

  if (!teamContext || !billingContext || !teamUiMode) {
    return null;
  }

  const { billingEnabled, subscription, effectivePlanKey, billingInterval, isPaidPlan } =
    billingContext;
  const currentPaidPlanKey: PlanKey | null =
    isPaidPlan && effectivePlanKey && effectivePlanKey !== "free" ? effectivePlanKey : null;

  // Fetch live Stripe pricing for both free-user plan grid and paid-user
  // per-seat display, so prices always match what Stripe actually charges.
  // cache() deduplicates within the same React request.
  const livePricing = await getPublicPricingCatalog();
  const livePlan = currentPaidPlanKey
    ? (livePricing.find((plan) => plan.key === currentPaidPlanKey) ?? null)
    : null;
  const perSeatAmount = livePlan
    ? billingInterval === "year" && livePlan.amountAnnualMonthly
      ? livePlan.amountAnnualMonthly
      : livePlan.amountMonthly
    : null;
  const estimatedMonthlySeatTotal =
    subscription && perSeatAmount !== null ? subscription.seat_quantity * perSeatAmount : null;
  const hasSubscription = Boolean(subscription);
  const canManageBilling = canManageTeamBilling(teamContext.role);

  return (
    <>
      {checkoutStatus === "success" ? (
        <section
          className={cn(
            billingSectionClass,
            "bg-emerald-500/5 ring-emerald-500/30 dark:bg-emerald-500/10",
          )}
        >
          <div className="flex gap-3 sm:items-start">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{t("checkoutSuccess.title")}</p>
              <p className="text-sm text-muted-foreground">{t("checkoutSuccess.message")}</p>
            </div>
          </div>
        </section>
      ) : null}

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("header.eyebrow")}
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">{t("header.title")}</h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">{t("header.description")}</p>
      </div>

      {!isPaidPlan ? (
        <div className="space-y-6">
          {!billingEnabled ? (
            <DashboardPageSection
              icon={AlertCircle}
              variant="destructive"
              title={t("billingDisabled.title")}
              description={t("billingDisabled.description")}
            />
          ) : null}

          <DashboardPageSection
            icon={Sparkles}
            iconTone="primary"
            title={t("freeMode.title")}
            description={t("freeMode.description")}
          />

          <DashboardPageSection
            icon={LayoutGrid}
            title={t("freeMode.compareTitle")}
            description={t("freeMode.compareDescription")}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {livePricing.map((plan) => (
                <div
                  key={plan.key}
                  className={cn(
                    "relative rounded-xl bg-muted/30 p-6 ring-1 ring-border transition-shadow hover:shadow-md",
                    plan.popular &&
                      "bg-card ring-2 ring-primary ring-offset-2 ring-offset-background dark:ring-offset-card",
                  )}
                >
                  {plan.popular ? (
                    <div className="absolute -top-2.5 left-6">
                      <Badge variant="default" className="shadow-sm">
                        {t("freeMode.popularBadge")}
                      </Badge>
                    </div>
                  ) : null}
                  <h3 className="text-base font-medium text-foreground">
                    {tPlanCopy(`plans.${plan.key}.name`)}
                  </h3>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    {plan.priceLabel}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {tPlanCopy(`plans.${plan.key}.description`)}
                  </p>
                  <div className="mt-4 space-y-2 border-t border-border pt-4">
                    <p className="text-sm text-muted-foreground">
                      {t("freeMode.perSeat", { amount: plan.priceLabel })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("freeMode.collaborationIncluded")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </DashboardPageSection>
        </div>
      ) : (
        <DashboardPageSection
          icon={Receipt}
          borderedHeader
          title={t("currentSubscription.title")}
          description={t("currentSubscription.subtitle")}
          endSlot={
            subscription ? (
              <Badge
                variant={subscriptionStatusBadgeVariant(subscription.status)}
                className="h-6 w-fit shrink-0 sm:mt-0.5"
              >
                {subscriptionStatusLabel(t, subscription.status)}
              </Badge>
            ) : null
          }
        >
          <div className="space-y-6">
            {subscription ? (
              <>
                {subscription.cancel_at_period_end ? (
                  <div
                    className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100"
                    role="status"
                  >
                    {t("currentSubscription.cancelScheduled")}
                  </div>
                ) : null}
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="flex flex-col gap-5">
                    <SubscriptionDetail
                      icon={CreditCard}
                      label={t("currentSubscription.currentPlan")}
                    >
                      {currentPaidPlanKey
                        ? tPlanCopy(`plans.${currentPaidPlanKey}.name`)
                        : t("currentSubscription.unknown")}
                    </SubscriptionDetail>
                    {billingInterval ? (
                      <SubscriptionDetail
                        icon={CalendarDays}
                        label={t("currentSubscription.billingInterval")}
                      >
                        {billingInterval === "year"
                          ? t("currentSubscription.annual")
                          : t("currentSubscription.monthly")}
                      </SubscriptionDetail>
                    ) : null}
                    <SubscriptionDetail
                      icon={CalendarDays}
                      label={t("currentSubscription.periodEnd")}
                    >
                      {subscription.current_period_end
                        ? formatUtcDate(subscription.current_period_end, undefined, locale)
                        : t("currentSubscription.notAvailable")}
                    </SubscriptionDetail>
                  </div>
                  <div className="flex flex-col gap-5">
                    <SubscriptionDetail icon={Users} label={t("currentSubscription.seats")}>
                      {subscription.seat_quantity}
                    </SubscriptionDetail>
                    {perSeatAmount !== null ? (
                      <SubscriptionDetail icon={Coins} label={t("currentSubscription.perSeatCost")}>
                        <span>
                          {catalogSeatPrice(perSeatAmount)}
                          {billingInterval === "year" ? (
                            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                              ({t("currentSubscription.billedAnnually")})
                            </span>
                          ) : null}
                        </span>
                      </SubscriptionDetail>
                    ) : null}
                    {perSeatAmount !== null && estimatedMonthlySeatTotal != null ? (
                      <SubscriptionDetail
                        icon={CircleDollarSign}
                        label={t("currentSubscription.totalCost")}
                      >
                        {billingInterval === "year"
                          ? t("currentSubscription.totalYearlyValue", {
                              amount: new Intl.NumberFormat(locale, {
                                style: "currency",
                                currency: "USD",
                                maximumFractionDigits: 0,
                              }).format(estimatedMonthlySeatTotal * 12),
                            })
                          : t("currentSubscription.totalMonthlyValue", {
                              amount: new Intl.NumberFormat(locale, {
                                style: "currency",
                                currency: "USD",
                                maximumFractionDigits: 0,
                              }).format(estimatedMonthlySeatTotal),
                            })}
                      </SubscriptionDetail>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                {t("currentSubscription.noSubscription")}
              </div>
            )}
          </div>
        </DashboardPageSection>
      )}

      <BillingActions
        billingEnabled={billingEnabled}
        currentPlanKey={currentPaidPlanKey}
        hasSubscription={hasSubscription}
        canManageBilling={canManageBilling}
      />

      {aiUiGate.isVisibleInUi ? (
        <Suspense fallback={<AiUsageCardSkeleton />}>
          <AiUsageCard
            teamId={teamContext.teamId}
            locale={locale}
            copy={{
              title: tUsage("header.title"),
              noUsage: tUsage("table.noUsage"),
              noUsageDescription: tUsage("table.noUsageDescription"),
              month: tUsage("table.month"),
              usedTokens: tUsage("table.usedTokens"),
              reservedTokens: tUsage("table.reservedTokens"),
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}
