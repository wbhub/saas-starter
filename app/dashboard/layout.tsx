import { Suspense } from "react";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { IntercomProvider } from "@/components/intercom-provider";
import { NoTeamCard } from "@/components/no-team-card";
import { TeamContextErrorCard } from "@/components/team-context-error-card";
import { ONBOARDING_COMPLETE_COOKIE } from "@/lib/constants/onboarding";
import { getDashboardShellData } from "@/lib/dashboard/server";
import { isBillingEnabled } from "@/lib/billing/capabilities";
import { env } from "@/lib/env";

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const shellData = await getDashboardShellData();
  const intercomAppId = env.NEXT_PUBLIC_INTERCOM_APP_ID;
  const shouldRenderIntercom = Boolean(intercomAppId && env.INTERCOM_IDENTITY_SECRET);

  if (shellData.teamContextLoadFailed) {
    return (
      <main className="min-h-screen bg-[color:var(--background)] px-6 py-10 text-[color:var(--foreground)]">
        <TeamContextErrorCard />
      </main>
    );
  }

  if (!shellData.teamContext || !shellData.billingContext || !shellData.teamUiMode) {
    return (
      <main className="min-h-screen bg-[color:var(--background)] px-6 py-10 text-[color:var(--foreground)]">
        <NoTeamCard />
      </main>
    );
  }

  // Onboarding / paywall gate: redirect users who haven't completed onboarding
  if (isBillingEnabled()) {
    const { effectivePlanKey } = shellData.billingContext;

    // No plan at all (free plan disabled + no subscription) → must onboard
    if (effectivePlanKey === null) {
      redirect("/onboarding");
    }

    // Free plan but hasn't completed onboarding → must select a plan
    if (effectivePlanKey === "free" && shellData.profile) {
      const { data: onboardingCheck } = await shellData.supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", shellData.user.id)
        .maybeSingle<{ onboarding_completed_at: string | null }>();

      if (!onboardingCheck?.onboarding_completed_at) {
        redirect("/onboarding");
      }
    }
  }

  // User passed the onboarding gate — mark onboarding complete for client-side UI hints
  const cookieStore = await cookies();
  if (!cookieStore.get(ONBOARDING_COMPLETE_COOKIE)) {
    cookieStore.set(ONBOARDING_COMPLETE_COOKIE, "1", {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return (
    <>
      {shouldRenderIntercom && intercomAppId ? (
        <Suspense fallback={null}>
          <IntercomProvider appId={intercomAppId} />
        </Suspense>
      ) : null}
      <DashboardShell
        displayName={shellData.displayName}
        userEmail={shellData.user.email ?? null}
        avatarUrl={shellData.profile?.avatar_url ?? null}
        teamName={shellData.teamContext.teamName}
        role={shellData.teamContext.role}
        teamUiMode={shellData.teamUiMode}
        showAiNav={shellData.aiUiGate.isVisibleInUi}
        activeTeamId={shellData.teamContext.teamId}
        csrfToken={shellData.csrfToken}
      >
        {children}
      </DashboardShell>
    </>
  );
}
