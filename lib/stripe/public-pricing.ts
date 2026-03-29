import "server-only";
import { cache } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { logger } from "@/lib/logger";
import { formatStaticUsdMonthlyLabel } from "@/lib/stripe/plan-price-display";
import { plans } from "@/lib/stripe/config";
import { getStripeServerClient } from "@/lib/stripe/server";

export type PublicPricingPlan = {
  key: (typeof plans)[number]["key"];
  name: string;
  description: string;
  priceLabel: string;
  annualPriceLabel?: string;
  amountMonthly: number;
  amountAnnualMonthly?: number;
  popular?: boolean;
  features: string[];
};

let warnedStripePricingDisabled = false;

function formatIntervalLabel(
  interval: string | null | undefined,
  intervalCount: number | null | undefined,
  t: (key: string, values?: Record<string, string>) => string,
) {
  if (!interval) return "";
  if (!intervalCount || intervalCount === 1) {
    if (interval === "month") return t("priceSuffix.month");
    if (interval === "year") return t("priceSuffix.year");
    if (interval === "week") return t("priceSuffix.week");
    if (interval === "day") return t("priceSuffix.day");
    return t("priceSuffix.other", { interval });
  }
  return `/${intervalCount} ${interval}s`;
}

function formatStripePriceLabel(
  price: {
    currency: string;
    unit_amount: number | null;
    recurring: { interval: string; interval_count: number } | null;
  },
  locale: string,
  t: (key: string, values?: Record<string, string>) => string,
) {
  if (price.unit_amount === null) {
    return null;
  }
  const amount = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: price.currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(price.unit_amount / 100);
  const suffix = formatIntervalLabel(price.recurring?.interval, price.recurring?.interval_count, t);
  return `${amount}${suffix}`;
}

export const getPublicPricingCatalog = cache(async (): Promise<PublicPricingPlan[]> => {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("Landing.pricing")]);
  const monthSuffix = t("priceSuffix.month");
  const catalogPrice = (amountMonthly: number) =>
    formatStaticUsdMonthlyLabel(amountMonthly, locale, monthSuffix);

  const stripe = getStripeServerClient();
  if (!stripe) {
    if (!warnedStripePricingDisabled) {
      warnedStripePricingDisabled = true;
      logger.warn("Stripe is not configured; using static pricing labels.");
    }
    return plans.map((plan) => ({
      key: plan.key,
      name: plan.name,
      description: plan.description,
      priceLabel: catalogPrice(plan.amountMonthly),
      annualPriceLabel: plan.amountAnnualMonthly
        ? catalogPrice(plan.amountAnnualMonthly)
        : undefined,
      amountMonthly: plan.amountMonthly,
      amountAnnualMonthly: plan.amountAnnualMonthly,
      popular: plan.popular,
      features: plan.features,
    }));
  }

  type StripePrice = Awaited<ReturnType<typeof stripe.prices.retrieve>>;
  const formatRetrieveError = (error: unknown) =>
    error instanceof Error ? { name: error.name, message: error.message } : String(error);

  const stripePrices = await Promise.all(
    plans.map(async (plan) => {
      const monthlyPromise: Promise<StripePrice | null> = plan.priceId
        ? stripe.prices.retrieve(plan.priceId).catch((error) => {
            logger.warn("Failed to retrieve Stripe monthly price for plan; using static label.", {
              planKey: plan.key,
              error: formatRetrieveError(error),
            });
            return null;
          })
        : (() => {
            logger.warn("Missing Stripe price id for plan; using static label.", {
              planKey: plan.key,
            });
            return Promise.resolve(null);
          })();

      const annualPromise: Promise<StripePrice | null> = plan.annualPriceId
        ? stripe.prices.retrieve(plan.annualPriceId).catch((error) => {
            logger.warn("Failed to retrieve Stripe annual price for plan; using static label.", {
              planKey: plan.key,
              error: formatRetrieveError(error),
            });
            return null;
          })
        : Promise.resolve(null);

      const [monthlyPrice, annualPrice] = await Promise.all([monthlyPromise, annualPromise]);
      return [plan.key, { monthlyPrice, annualPrice }] as const;
    }),
  );

  const stripePriceByPlanKey = new Map(stripePrices);

  return plans.map((plan) => {
    const prices = stripePriceByPlanKey.get(plan.key);
    const monthlyStripePrice = prices?.monthlyPrice ?? null;
    const annualStripePrice = prices?.annualPrice ?? null;

    const resolvedMonthlyLabel = monthlyStripePrice
      ? formatStripePriceLabel(
          {
            currency: monthlyStripePrice.currency,
            unit_amount: monthlyStripePrice.unit_amount,
            recurring: monthlyStripePrice.recurring
              ? {
                  interval: monthlyStripePrice.recurring.interval,
                  interval_count: monthlyStripePrice.recurring.interval_count,
                }
              : null,
          },
          locale,
          t,
        )
      : null;

    const resolvedAnnualMonthlyLabel = annualStripePrice
      ? formatStripePriceLabel(
          {
            currency: annualStripePrice.currency,
            unit_amount:
              annualStripePrice.unit_amount !== null
                ? Math.round(annualStripePrice.unit_amount / 12)
                : null,
            recurring: { interval: "month", interval_count: 1 },
          },
          locale,
          t,
        )
      : null;

    const liveAmountMonthly =
      monthlyStripePrice?.unit_amount !== null && monthlyStripePrice?.unit_amount !== undefined
        ? monthlyStripePrice.unit_amount / 100
        : plan.amountMonthly;

    const liveAmountAnnualMonthly =
      annualStripePrice?.unit_amount !== null && annualStripePrice?.unit_amount !== undefined
        ? annualStripePrice.unit_amount / 100 / 12
        : plan.amountAnnualMonthly;

    return {
      key: plan.key,
      name: plan.name,
      description: plan.description,
      priceLabel: resolvedMonthlyLabel ?? catalogPrice(plan.amountMonthly),
      annualPriceLabel: resolvedAnnualMonthlyLabel
        ? resolvedAnnualMonthlyLabel
        : plan.amountAnnualMonthly
          ? catalogPrice(plan.amountAnnualMonthly)
          : undefined,
      amountMonthly: liveAmountMonthly,
      amountAnnualMonthly: liveAmountAnnualMonthly,
      popular: plan.popular,
      features: plan.features,
    };
  });
});
