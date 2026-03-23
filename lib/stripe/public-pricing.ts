import "server-only";
import { cache } from "react";
import { logger } from "@/lib/logger";
import { plans } from "@/lib/stripe/config";
import { getStripeServerClient } from "@/lib/stripe/server";

type PublicPricingPlan = {
  key: (typeof plans)[number]["key"];
  name: string;
  description: string;
  priceLabel: string;
  popular?: boolean;
};

let warnedStripePricingDisabled = false;

function formatIntervalLabel(interval?: string | null, intervalCount?: number | null) {
  if (!interval) return "";
  if (!intervalCount || intervalCount === 1) {
    return interval === "month" ? "/mo" : interval === "year" ? "/yr" : `/${interval}`;
  }
  return `/${intervalCount} ${interval}s`;
}

function formatPriceLabel(price: {
  currency: string;
  unit_amount: number | null;
  recurring: { interval: string; interval_count: number } | null;
}) {
  if (price.unit_amount === null) {
    return null;
  }
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(price.unit_amount / 100);
  const suffix = formatIntervalLabel(price.recurring?.interval, price.recurring?.interval_count);
  return `${amount}${suffix}`;
}

export const getPublicPricingCatalog = cache(async (): Promise<PublicPricingPlan[]> => {
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
      priceLabel: plan.priceLabel,
      popular: plan.popular,
    }));
  }

  const stripePrices = await Promise.all(
    plans.map(async (plan) => {
      if (!plan.priceId) {
        logger.warn("Missing Stripe price id for plan; using static label.", {
          planKey: plan.key,
        });
        return [plan.key, null] as const;
      }
      try {
        const stripePrice = await stripe.prices.retrieve(plan.priceId);
        return [plan.key, stripePrice] as const;
      } catch (error) {
        logger.warn("Failed to retrieve Stripe price for plan; using static label.", {
          planKey: plan.key,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : String(error),
        });
        return [plan.key, null] as const;
      }
    }),
  );

  const stripePriceByPlanKey = new Map(stripePrices);

  return plans.map((plan) => {
    const stripePrice = stripePriceByPlanKey.get(plan.key);
    const resolvedLabel =
      stripePrice &&
      formatPriceLabel({
        currency: stripePrice.currency,
        unit_amount: stripePrice.unit_amount,
        recurring: stripePrice.recurring
          ? {
              interval: stripePrice.recurring.interval,
              interval_count: stripePrice.recurring.interval_count,
            }
          : null,
      });

    return {
      key: plan.key,
      name: plan.name,
      description: plan.description,
      priceLabel: resolvedLabel ?? plan.priceLabel,
      popular: plan.popular,
    };
  });
});
