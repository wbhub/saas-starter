"use client";

import { useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { AuthAwareLink } from "@/components/auth-aware-link";
import { buttonVariants } from "@/components/ui/button-variants";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

type PricingPlan = {
  key: string;
  name: string;
  description: string;
  priceLabel: string;
  annualPriceLabel?: string;
  popular?: boolean;
};

type Props = {
  plans: PricingPlan[];
  showAnnualToggle: boolean;
};

export function LandingPricingCards({ plans, showAnnualToggle }: Props) {
  const t = useTranslations("Landing.pricing");
  const [isAnnual, setIsAnnual] = useState(false);
  const pricingGridStyle = {
    "--pricing-plan-count": String(Math.max(plans.length, 1)),
  } as CSSProperties;

  return (
    <>
      {showAnnualToggle ? (
        <div className="flex items-center justify-center gap-3">
          <SegmentedControl
            aria-label={`${t("toggle.monthly")} / ${t("toggle.annual")}`}
            value={isAnnual ? "year" : "month"}
            onValueChange={(nextValue) => setIsAnnual(nextValue === "year")}
            options={[
              { value: "month", label: t("toggle.monthly") },
              { value: "year", label: t("toggle.annual") },
            ]}
          />
          {isAnnual ? (
            <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
              {t("toggle.save")}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        className="grid gap-4 md:[grid-template-columns:repeat(var(--pricing-plan-count),minmax(0,1fr))]"
        style={pricingGridStyle}
      >
        {plans.map((tier) => (
          <article
            key={tier.key}
            className={`rounded-2xl border bg-card p-6 ${
              tier.popular ? "border-primary/50 shadow-lg shadow-primary/10" : "border-border"
            }`}
          >
            <p
              aria-hidden={!tier.popular}
              className={`mb-3 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ${
                tier.popular ? "" : "invisible"
              }`}
            >
              {t("mostPopular")}
            </p>
            <h3 className="text-lg font-semibold">{t(`plans.${tier.key}.name`)}</h3>
            <div className="mt-2 flex items-baseline gap-1.5">
              <p className="text-3xl font-semibold text-primary">
                {isAnnual && tier.annualPriceLabel ? tier.annualPriceLabel : tier.priceLabel}
              </p>
              {isAnnual && tier.annualPriceLabel ? (
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  {t("toggle.save")}
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground mt-3 text-sm">
              {t(`plans.${tier.key}.description`)}
            </p>
            <AuthAwareLink
              loggedInHref="/dashboard"
              loggedOutHref="/onboarding"
              loggedInLabel={t("managePlan")}
              loggedOutLabel={t("choosePlan", { name: t(`plans.${tier.key}.name`) })}
              className={cn(
                buttonVariants({ variant: "default", size: "cta" }),
                "mt-6 inline-flex w-full justify-center sm:w-auto",
              )}
            />
          </article>
        ))}
      </div>
    </>
  );
}
