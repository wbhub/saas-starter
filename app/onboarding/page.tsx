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
import { ensureStripeCustomerForTeam } from "@/lib/stripe/ensure-customer";
import { FREE_PLAN_FEATURES, PLAN_KEYS } from "@/lib/stripe/plans";
import { createCheckoutUrl } from "@/lib/stripe/create-checkout-url";
import { canManageTeamBilling } from "@/lib/team-context";
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

  // --- Authenticated-only logic ---
  if (user) {
    const teamContext = await getCachedTeamContextForUser(supabase, user.id);
    if (!teamContext) {
      redirect("/dashboard");
    }

    // Eagerly create Stripe customer so it's ready when the user clicks checkout.
    // Awaited because the fast path (customer exists) is just a DB lookup, and
    // the slow path (create) ensures createCheckoutUrl below can skip creation.
    // Failures are non-fatal — checkout routes have their own fallback.
    await ensureStripeCustomerForTeam(teamContext.teamId, user.id, user.email ?? "").catch(() => {});

    const checkoutStatus = getFirstSearchParamValue(resolvedSearchParams.checkout);

    // Handle checkout success return — the webhook handles subscription sync,
    // so we just mark onboarding complete and redirect.
    if (checkoutStatus === "success") {
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

    // Server-side checkout redirect: if returning from signup with a paid plan
    // param, create the Stripe session and redirect immediately (no page render).
    const validPlanParam =
      selectedPlan && (PLAN_KEYS as readonly string[]).includes(selectedPlan) ? selectedPlan : null;

    if (validPlanParam && validPlanParam !== "free" && canManageTeamBilling(teamContext.role)) {
      const checkoutUrl = await createCheckoutUrl({
        teamId: teamContext.teamId,
        userId: user.id,
        userEmail: user.email ?? "",
        planKey: validPlanParam as import("@/lib/stripe/plans").PlanKey,
        interval: selectedInterval === "year" ? "year" : "month",
        source: "onboarding",
      });

      if (checkoutUrl) {
        redirect(checkoutUrl);
      }
    }

    // Server-side free plan completion: if returning from signup with free plan
    if (validPlanParam === "free") {
      try {
        await supabase
          .from("profiles")
          .update({ onboarding_completed_at: new Date().toISOString() })
          .eq("id", user.id);
        redirect("/dashboard");
      } catch (error) {
        logger.warn("Free plan onboarding completion failed", { error });
      }
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

      <main className="flex flex-1 flex-col items-center px-4 py-12">
        <div className={`my-auto w-full ${freePlanEnabled ? "max-w-7xl" : "max-w-5xl"}`}>
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
          />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
