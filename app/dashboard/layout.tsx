import { Suspense } from "react";
import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { IntercomProvider } from "@/components/intercom-provider";
import { NoTeamCard } from "@/components/no-team-card";
import { TeamContextErrorCard } from "@/components/team-context-error-card";
import { getDashboardShellData } from "@/lib/dashboard/server";
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
