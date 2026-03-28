import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { BillingActions } from "@/components/billing-actions";
import { formatUtcDate } from "@/lib/date";
import { formatStaticUsdMonthlyLabel } from "@/lib/stripe/plan-price-display";
import { canManageTeamBilling } from "@/lib/team-context";
import { getDashboardBaseData, getDashboardShellData } from "@/lib/dashboard/server";
import { PLAN_CATALOG, type PlanKey } from "@/lib/stripe/plans";
import { syncCheckoutSuccessForTeam } from "@/lib/stripe/checkout-success";
import { logger } from "@/lib/logger";

type DashboardBillingPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function getFirstSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardBillingPage({
  searchParams,
}: DashboardBillingPageProps = {}) {
  const t = await getTranslations("DashboardBillingPage");
  const tPlanCopy = await getTranslations("Landing.pricing");
  const locale = await getLocale();
  const priceSuffixMonth = tPlanCopy("priceSuffix.month");
  const catalogSeatPrice = (amountMonthly: number) =>
    formatStaticUsdMonthlyLabel(amountMonthly, locale, priceSuffixMonth);
  const resolvedSearchParams = (await searchParams) ?? {};
  const checkoutStatus = getFirstSearchParamValue(resolvedSearchParams.checkout);
  const checkoutSessionId = getFirstSearchParamValue(resolvedSearchParams.session_id);
  const baseData = await getDashboardBaseData();

  if (checkoutStatus === "success" && baseData.teamContext) {
    try {
      await syncCheckoutSuccessForTeam(baseData.teamContext.teamId, {
        sessionId: checkoutSessionId ?? null,
      });
    } catch (error) {
      logger.warn(
        "Billing page checkout-success sync failed; continuing with current billing view.",
        {
          teamId: baseData.teamContext.teamId,
          checkoutSessionId: checkoutSessionId ?? null,
          error,
        },
      );
    }
  }

  const { teamContext, billingContext, teamUiMode } = await getDashboardShellData();

  if (!teamContext || !billingContext || !teamUiMode) {
    return null;
  }

  const { billingEnabled, subscription, effectivePlanKey, memberCount, isPaidPlan } =
    billingContext;
  const currentPaidPlanKey: PlanKey | null =
    isPaidPlan && effectivePlanKey && effectivePlanKey !== "free" ? effectivePlanKey : null;
  const currentPlan = currentPaidPlanKey
    ? (PLAN_CATALOG.find((plan) => plan.key === currentPaidPlanKey) ?? null)
    : null;
  const estimatedMonthlySeatTotal =
    subscription && currentPlan ? subscription.seat_quantity * currentPlan.amountMonthly : null;
  const hasSubscription = Boolean(subscription);
  const canManageBilling = canManageTeamBilling(teamContext.role);

  return (
    <>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("header.eyebrow")}
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">{t("header.title")}</h1>
        <p className="mt-2 text-base text-muted-foreground">{t("header.description")}</p>
      </div>

      {!isPaidPlan ? (
        <section className="space-y-4">
          {!billingEnabled ? (
            <div className="rounded-xl bg-card ring-1 ring-border p-6">
              <h2 className="text-lg font-semibold text-foreground">
                {t("billingDisabled.title")}
              </h2>
              <p className="mt-2 text-muted-foreground">{t("billingDisabled.description")}</p>
            </div>
          ) : null}
          <div className="rounded-xl bg-card ring-1 ring-border p-6">
            <h2 className="text-lg font-semibold text-foreground">{t("freeMode.title")}</h2>
            <p className="mt-2 text-muted-foreground">{t("freeMode.description")}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {PLAN_CATALOG.map((plan) => (
              <article
                key={plan.key}
                className="rounded-xl bg-card ring-1 ring-border p-6 transition-colors hover:bg-muted/50"
              >
                <p className="text-sm font-medium text-muted-foreground">
                  {tPlanCopy(`plans.${plan.key}.name`)}
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {catalogSeatPrice(plan.amountMonthly)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tPlanCopy(`plans.${plan.key}.description`)}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("freeMode.perSeat", { amount: catalogSeatPrice(plan.amountMonthly) })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("freeMode.collaborationIncluded")}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-xl bg-card ring-1 ring-border p-6">
          <h2 className="text-lg font-semibold text-foreground">
            {t("currentSubscription.title")}
          </h2>
          {subscription ? (
            <dl className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t("currentSubscription.currentPlan")}</dt>
                <dd className="font-medium text-foreground">
                  {currentPaidPlanKey
                    ? tPlanCopy(`plans.${currentPaidPlanKey}.name`)
                    : t("currentSubscription.unknown")}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t("currentSubscription.status")}</dt>
                <dd className="uppercase tracking-wide text-foreground">{subscription.status}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t("currentSubscription.seats")}</dt>
                <dd className="text-foreground">{subscription.seat_quantity}</dd>
              </div>
              {currentPlan ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{t("currentSubscription.perSeatCost")}</dt>
                  <dd className="text-foreground">{catalogSeatPrice(currentPlan.amountMonthly)}</dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t("currentSubscription.periodEnd")}</dt>
                <dd className="text-foreground">
                  {subscription.current_period_end
                    ? formatUtcDate(subscription.current_period_end, undefined, locale)
                    : t("currentSubscription.notAvailable")}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="mt-4 rounded-lg app-surface-subtle p-4 text-sm text-muted-foreground">
              {t("currentSubscription.noSubscription")}
            </div>
          )}
          {teamUiMode === "paid_team" && currentPlan && estimatedMonthlySeatTotal !== null ? (
            <p className="mt-4 rounded-lg app-surface-subtle px-3 py-2 text-sm text-muted-foreground">
              {t("paidTeam.breakdown", {
                seats: String(subscription?.seat_quantity ?? memberCount),
                seatCost: catalogSeatPrice(currentPlan.amountMonthly),
                monthlyTotal: new Intl.NumberFormat(locale, {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                }).format(estimatedMonthlySeatTotal),
              })}
            </p>
          ) : null}
        </section>
      )}

      <section>
        <BillingActions
          billingEnabled={billingEnabled}
          currentPlanKey={currentPaidPlanKey}
          hasSubscription={hasSubscription}
          canManageBilling={canManageBilling}
        />
      </section>

      {teamUiMode === "paid_solo" && currentPlan ? (
        <section className="rounded-xl bg-card ring-1 ring-border p-6">
          <h2 className="text-lg font-semibold text-foreground">{t("paidSolo.title")}</h2>
          <p className="mt-2 text-muted-foreground">
            {t("paidSolo.description", { amount: catalogSeatPrice(currentPlan.amountMonthly) })}
          </p>
          <Link
            href="/dashboard/team"
            className="mt-4 inline-flex rounded-lg border app-border-subtle px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-[color:var(--surface-subtle)]"
          >
            {t("paidSolo.action")}
          </Link>
        </section>
      ) : null}
    </>
  );
}
