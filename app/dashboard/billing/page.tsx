import { Suspense } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  CreditCard,
  Receipt,
  Sparkles,
  Users,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { AiUsageCard, AiUsageCardSkeleton } from "@/components/ai-usage-card";
import { BillingActions } from "@/components/billing-actions";
import { DashboardPageHeader, DashboardPageStack } from "@/components/dashboard-page-header";
import { Badge } from "@/components/ui/badge";
import { formatUtcDate } from "@/lib/date";
import { formatStaticUsdMonthlyLabel } from "@/lib/stripe/plan-price-display";
import { resolvePlanKeyByPriceId } from "@/lib/stripe/price-id-lookup";
import { canManageTeamBilling } from "@/lib/team-context";
import { getDashboardShellData } from "@/lib/dashboard/server";
import type { PlanKey, SubscriptionStatus } from "@/lib/stripe/plans";
import { hasAnnualPricing } from "@/lib/stripe/config";
import { syncCheckoutSuccessForTeam } from "@/lib/stripe/checkout-success";
import { getPublicPricingCatalog } from "@/lib/stripe/public-pricing";
import { createClient } from "@/lib/supabase/server";
import { getCachedTeamContextForUser } from "@/lib/team-context-cache";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { DashboardDetailField } from "@/components/dashboard-detail-field";
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

  const { billingEnabled, subscription, effectivePlanKey, billingInterval } = billingContext;
  const currentSubscriptionPlanKey: PlanKey | null =
    resolvePlanKeyByPriceId(subscription?.stripe_price_id) ??
    (effectivePlanKey && effectivePlanKey !== "free" ? effectivePlanKey : null);

  // Fetch live Stripe pricing for both free-user plan grid and paid-user
  // per-seat display, so prices always match what Stripe actually charges.
  // cache() deduplicates within the same React request.
  const livePricing = await getPublicPricingCatalog();
  const livePlan = currentSubscriptionPlanKey
    ? (livePricing.find((plan) => plan.key === currentSubscriptionPlanKey) ?? null)
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
      <DashboardPageStack>
        {checkoutStatus === "success" ? (
          <section
            className={cn(billingSectionClass, "bg-success/5 ring-success/30 dark:bg-success/10")}
          >
            <div className="flex gap-3 sm:items-start">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/15 text-success-foreground dark:text-success">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{t("checkoutSuccess.title")}</p>
                <p className="text-sm text-muted-foreground">{t("checkoutSuccess.message")}</p>
              </div>
            </div>
          </section>
        ) : null}

        <DashboardPageHeader
          eyebrow={t("header.eyebrow")}
          title={t("header.title")}
          description={t("header.description")}
        />

        {!subscription ? (
          <>
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
          </>
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
                      className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground dark:border-warning/30 dark:bg-warning/15 dark:text-warning"
                      role="status"
                    >
                      {t("currentSubscription.cancelScheduled")}
                    </div>
                  ) : null}
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="flex flex-col gap-5">
                      <DashboardDetailField
                        icon={CreditCard}
                        label={t("currentSubscription.currentPlan")}
                      >
                        {currentSubscriptionPlanKey
                          ? tPlanCopy(`plans.${currentSubscriptionPlanKey}.name`)
                          : t("currentSubscription.unknown")}
                      </DashboardDetailField>
                      {billingInterval ? (
                        <DashboardDetailField
                          icon={CalendarDays}
                          label={t("currentSubscription.billingInterval")}
                        >
                          {billingInterval === "year"
                            ? t("currentSubscription.annual")
                            : t("currentSubscription.monthly")}
                        </DashboardDetailField>
                      ) : null}
                      <DashboardDetailField
                        icon={CalendarDays}
                        label={t("currentSubscription.periodEnd")}
                      >
                        {subscription.current_period_end
                          ? formatUtcDate(subscription.current_period_end, undefined, locale)
                          : t("currentSubscription.notAvailable")}
                      </DashboardDetailField>
                    </div>
                    <div className="flex flex-col gap-5">
                      <DashboardDetailField icon={Users} label={t("currentSubscription.seats")}>
                        {subscription.seat_quantity}
                      </DashboardDetailField>
                      {perSeatAmount !== null ? (
                        <DashboardDetailField
                          icon={Coins}
                          label={t("currentSubscription.perSeatCost")}
                        >
                          <span>
                            {catalogSeatPrice(perSeatAmount)}
                            {billingInterval === "year" ? (
                              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                                ({t("currentSubscription.billedAnnually")})
                              </span>
                            ) : null}
                          </span>
                        </DashboardDetailField>
                      ) : null}
                      {perSeatAmount !== null && estimatedMonthlySeatTotal != null ? (
                        <DashboardDetailField
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
                        </DashboardDetailField>
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
          currentPlanKey={currentSubscriptionPlanKey}
          hasSubscription={hasSubscription}
          canManageBilling={canManageBilling}
          plans={livePricing}
          showAnnualToggle={hasAnnualPricing}
          currentBillingInterval={billingInterval ?? null}
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
      </DashboardPageStack>
    </>
  );
}
