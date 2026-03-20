import { DashboardShell } from "@/components/dashboard-shell";
import { NoTeamCard } from "@/components/no-team-card";
import { TeamContextErrorCard } from "@/components/team-context-error-card";
import { formatUtcDate } from "@/lib/date";
import {
  getDashboardBaseData,
  getUsageMonthlyTotals,
} from "@/lib/dashboard/server";

function formatTokens(value: number) {
  return new Intl.NumberFormat().format(value);
}

export default async function DashboardUsagePage() {
  const { supabase, user, teamContext, teamContextLoadFailed, teamMemberships, displayName } =
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

  const usageRows = await getUsageMonthlyTotals(supabase, teamContext.teamId);

  return (
    <DashboardShell
      displayName={displayName}
      userEmail={user.email ?? null}
      teamName={teamContext.teamName}
      role={teamContext.role}
      activeTeamId={teamContext.teamId}
      teamMemberships={teamMemberships}
    >
      <header className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm sm:p-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">Usage</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">
          AI usage and monthly totals
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Track recent token usage for your team.
        </p>
      </header>

      <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Last 6 months</h2>
        {usageRows.length === 0 ? (
          <p className="mt-3 rounded-lg app-surface-subtle px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
            No usage data yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b app-border-subtle text-left text-slate-500 dark:text-slate-400">
                  <th className="px-2 py-2 font-medium">Month</th>
                  <th className="px-2 py-2 font-medium">Used tokens</th>
                  <th className="px-2 py-2 font-medium">Reserved tokens</th>
                </tr>
              </thead>
              <tbody>
                {usageRows.map((row) => (
                  <tr key={row.month_start} className="border-b app-border-subtle last:border-0">
                    <td className="px-2 py-2 text-slate-800 dark:text-slate-100">
                      {formatUtcDate(row.month_start, {
                        year: "numeric",
                        month: "short",
                      })}
                    </td>
                    <td className="px-2 py-2 text-slate-800 dark:text-slate-100">
                      {formatTokens(row.used_tokens)}
                    </td>
                    <td className="px-2 py-2 text-slate-800 dark:text-slate-100">
                      {formatTokens(row.reserved_tokens)}
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
