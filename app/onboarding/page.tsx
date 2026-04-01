import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { OnboardingPlanSelector } from "@/components/onboarding/plan-selector";
import { createClient } from "@/lib/supabase/server";
import { isBillingEnabled, isFreePlanEnabled } from "@/lib/billing/capabilities";
import { getCachedTeamContextForUser } from "@/lib/team-context-cache";
import { getDashboardBillingContext } from "@/lib/dashboard/team-snapshot";
import { plans, hasAnnualPricing } from "@/lib/stripe/config";
import { FREE_PLAN_FEATURES, PLAN_KEYS, type PlanInterval, type PlanKey } from "@/lib/stripe/plans";
import { syncCheckoutSuccessForTeam } from "@/lib/stripe/checkout-success";
import { getPublicPricingCatalog } from "@/lib/stripe/public-pricing";
import { canManageTeamBilling } from "@/lib/team-context";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

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

  // If billing is disabled entirely, skip onboarding
  if (!isBillingEnabled()) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedPlan = getFirstSearchParamValue(resolvedSearchParams.plan) ?? null;
  const selectedInterval = getFirstSearchParamValue(resolvedSearchParams.interval) ?? null;
  const isAuthenticated = Boolean(user);
  const freePlanEnabled = isFreePlanEnabled();
  const selectedPaidPlan = (PLAN_KEYS as readonly string[]).includes(selectedPlan ?? "")
    ? (selectedPlan as PlanKey)
    : null;
  const initialInterval: PlanInterval = selectedInterval === "year" ? "year" : "month";
  let autoStartPlanKey: PlanKey | null = null;
  let autoCompleteFreePlan = false;

  // --- Authenticated-only logic ---
  if (user) {
    const teamContext = await getCachedTeamContextForUser(supabase, user.id);
    if (!teamContext) {
      redirect("/dashboard");
    }

    const checkoutStatus = getFirstSearchParamValue(resolvedSearchParams.checkout);
    const sessionId = getFirstSearchParamValue(resolvedSearchParams.session_id) ?? null;

    // Handle checkout success return — eagerly sync the subscription via the
    // session_id so the dashboard reflects the new plan immediately, then mark
    // onboarding complete and redirect. The webhook remains authoritative.
    if (checkoutStatus === "success") {
      if (sessionId) {
        try {
          await syncCheckoutSuccessForTeam(teamContext.teamId, { sessionId });
        } catch (error) {
          logger.warn("Eager checkout sync failed on onboarding; webhook will handle it.", {
            teamId: teamContext.teamId,
            sessionId,
            error,
          });
        }
      }

      try {
        await supabase
          .from("profiles")
          .update({ onboarding_completed_at: new Date().toISOString() })
          .eq("id", user.id);
      } catch (error) {
        logger.warn("Onboarding completion update failed; redirecting to dashboard anyway.", {
          teamId: teamContext.teamId,
          error,
        });
      }
      redirect("/dashboard");
    }

    // Preserve the smooth post-signup handoff into Checkout, but leave the
    // actual Stripe side effect to the guarded POST route on the client.
    autoStartPlanKey =
      selectedPaidPlan && canManageTeamBilling(teamContext.role) ? selectedPaidPlan : null;
    autoCompleteFreePlan = freePlanEnabled && selectedPlan === "free";

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
  }

  const livePricing = await getPublicPricingCatalog();
  const planData = livePricing.map((lp) => {
    const configPlan = plans.find((p) => p.key === lp.key);
    return {
      key: lp.key,
      name: lp.name,
      amountMonthly: lp.amountMonthly,
      amountAnnualMonthly: lp.amountAnnualMonthly,
      description: lp.description,
      popular: lp.popular ?? false,
      features: lp.features,
      hasPriceId: configPlan?.priceId != null,
      hasAnnualPriceId: configPlan?.annualPriceId != null,
    };
  });

  return (
    <div className="app-content flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center px-4 py-12">
        <div className={cn("my-auto w-full", freePlanEnabled ? "max-w-7xl" : "max-w-5xl")}>
          <div className="text-center">
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">{t("title")}</h1>
            <p className="mt-3 text-lg text-muted-foreground">
              {freePlanEnabled ? t("description") : t("descriptionPaidOnly")}
            </p>
          </div>

          <OnboardingPlanSelector
            plans={planData}
            freePlanEnabled={freePlanEnabled}
            freePlanFeatures={FREE_PLAN_FEATURES as unknown as string[]}
            showAnnualToggle={hasAnnualPricing}
            isAuthenticated={isAuthenticated}
            initialInterval={initialInterval}
            autoStartPlanKey={autoStartPlanKey}
            autoCompleteFreePlan={autoCompleteFreePlan}
          />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
