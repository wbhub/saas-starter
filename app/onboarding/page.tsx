import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { OnboardingPlanSelector } from "@/components/onboarding/plan-selector";
import { createClient } from "@/lib/supabase/server";
import { isBillingEnabled, isFreePlanEnabled } from "@/lib/billing/capabilities";
import { getCachedTeamContextForUser } from "@/lib/team-context-cache";
import { getDashboardBillingContext } from "@/lib/dashboard/team-snapshot";
import { syncCheckoutSuccessForTeam } from "@/lib/stripe/checkout-success";
import { plans, hasAnnualPricing } from "@/lib/stripe/config";
import { FREE_PLAN_FEATURES } from "@/lib/stripe/plans";
import { logger } from "@/lib/logger";

type OnboardingPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function getFirstSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const t = await getTranslations("Onboarding");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/onboarding");
  }

  // If billing is disabled entirely, skip onboarding
  if (!isBillingEnabled()) {
    redirect("/dashboard");
  }

  const teamContext = await getCachedTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    redirect("/dashboard");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const checkoutStatus = getFirstSearchParamValue(resolvedSearchParams.checkout);
  const checkoutSessionId = getFirstSearchParamValue(resolvedSearchParams.session_id);

  // Handle checkout success return
  if (checkoutStatus === "success") {
    try {
      await syncCheckoutSuccessForTeam(teamContext.teamId, {
        sessionId: checkoutSessionId ?? null,
      });
      // Mark onboarding complete
      await supabase
        .from("profiles")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("id", user.id);
    } catch (error) {
      logger.warn("Onboarding checkout-success sync failed; redirecting to dashboard.", {
        teamId: teamContext.teamId,
        checkoutSessionId: checkoutSessionId ?? null,
        error,
      });
    }
    redirect("/dashboard");
  }

  const billingContext = await getDashboardBillingContext(supabase, teamContext.teamId);

  // Already on a paid plan — skip onboarding
  if (billingContext.isPaidPlan) {
    redirect("/dashboard");
  }

  // Already completed onboarding with a free plan — skip
  if (billingContext.effectivePlanKey === "free") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", user.id)
      .maybeSingle<{ onboarding_completed_at: string | null }>();

    if (profile?.onboarding_completed_at) {
      redirect("/dashboard");
    }
  }

  const freePlanEnabled = isFreePlanEnabled();

  const planData = plans.map((plan) => ({
    key: plan.key,
    name: plan.name,
    amountMonthly: plan.amountMonthly,
    amountAnnualMonthly: plan.amountAnnualMonthly,
    description: plan.description,
    popular: plan.popular ?? false,
    features: plan.features,
    hasPriceId: plan.priceId != null,
    hasAnnualPriceId: plan.annualPriceId != null,
  }));

  return (
    <div className="app-content flex min-h-screen flex-col bg-[color:var(--background)] text-[color:var(--foreground)]">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-5xl">
          <div className="text-center">
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              {t("title")}
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              {freePlanEnabled ? t("description") : t("descriptionPaidOnly")}
            </p>
          </div>

          <OnboardingPlanSelector
            plans={planData}
            freePlanEnabled={freePlanEnabled}
            freePlanFeatures={FREE_PLAN_FEATURES as unknown as string[]}
            showAnnualToggle={hasAnnualPricing}
          />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
