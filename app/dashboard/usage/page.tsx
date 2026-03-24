import { getLocale, getTranslations } from "next-intl/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { NoTeamCard } from "@/components/no-team-card";
import { TeamContextErrorCard } from "@/components/team-context-error-card";
import { formatUtcDate } from "@/lib/date";
import {
  getDashboardAiUiGate,
  getDashboardBaseData,
  getDashboardBillingContext,
  getUsageMonthlyTotals,
} from "@/lib/dashboard/server";

function formatTokens(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

export default async function DashboardUsagePage() {
  const t = await getTranslations("DashboardUsagePage");
  const locale = await getLocale();
  const {
    supabase,
    user,
    teamContext,
    teamContextLoadFailed,
    teamMemberships,
    displayName,
    csrfToken,
  } =
    await getDashboardBaseData();

  if (teamContextLoadFailed) {
    return (
      <main className="min-h-screen bg-[color:var(--background)] px-6 py-10 text-[color:var(--foreground)]">
        <TeamContextErrorCard />
      </main>
    );
  }

  if (!teamContext) {
    return (
      <main className="min-h-screen bg-[color:var(--background)] px-6 py-10 text-[color:var(--foreground)]">
        <NoTeamCard />
      </main>
    );
  }

  const [usageRows, billingContext, aiUiGate] = await Promise.all([
    getUsageMonthlyTotals(supabase, teamContext.teamId),
    getDashboardBillingContext(supabase, teamContext.teamId),
    getDashboardAiUiGate(supabase, teamContext.teamId),
  ]);
  const teamUiMode = !billingContext.isPaidPlan
    ? "free"
    : billingContext.memberCount > 1
      ? "paid_team"
      : "paid_solo";

  return (
    <DashboardShell
      displayName={displayName}
      userEmail={user.email ?? null}
      teamName={teamContext.teamName}
      role={teamContext.role}
      teamUiMode={teamUiMode}
      showAiNav={aiUiGate.isVisibleInUi}
      activeTeamId={teamContext.teamId}
      teamMemberships={teamMemberships}
      csrfToken={csrfToken}
    >
      <header className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm sm:p-6">
        <p className="text-sm text-muted-foreground">{t("header.eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          {t("header.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("header.description")}
        </p>
      </header>

      <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">{t("table.title")}</h2>
        {usageRows.length === 0 ? (
          <p className="mt-3 rounded-lg app-surface-subtle px-3 py-2 text-sm text-muted-foreground">
            {t("table.noUsage")}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b app-border-subtle text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium">{t("table.month")}</th>
                  <th className="px-2 py-2 font-medium">{t("table.usedTokens")}</th>
                  <th className="px-2 py-2 font-medium">{t("table.reservedTokens")}</th>
                </tr>
              </thead>
              <tbody>
                {usageRows.map((row) => (
                  <tr key={row.month_start} className="border-b app-border-subtle last:border-0">
                    <td className="px-2 py-2 text-foreground">
                      {formatUtcDate(row.month_start, {
                        year: "numeric",
                        month: "short",
                      }, locale)}
                    </td>
                    <td className="px-2 py-2 text-foreground">
                      {formatTokens(row.used_tokens, locale)}
                    </td>
                    <td className="px-2 py-2 text-foreground">
                      {formatTokens(row.reserved_tokens, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
