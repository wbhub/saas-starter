import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { BarChart3 } from "lucide-react";
import { formatUtcDate } from "@/lib/date";
import { getDashboardShellData, getUsageMonthlyTotals } from "@/lib/dashboard/server";

function formatTokens(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

function UsageTableSkeleton() {
  return (
    <section className="rounded-xl bg-card ring-1 ring-border p-6">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-4 h-40 animate-pulse rounded-xl bg-muted" />
    </section>
  );
}

async function UsageTableSection({
  teamId,
  locale,
  copy,
}: {
  teamId: string;
  locale: string;
  copy: {
    title: string;
    noUsage: string;
    noUsageDescription: string;
    month: string;
    usedTokens: string;
    reservedTokens: string;
  };
}) {
  const { supabase } = await getDashboardShellData();
  const usageRows = await getUsageMonthlyTotals(supabase, teamId);

  return (
    <section className="rounded-xl bg-card ring-1 ring-border p-6">
      <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
      {usageRows.length === 0 ? (
        <div className="mt-6 flex flex-col items-center py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <BarChart3 className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">{copy.noUsage}</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">{copy.noUsageDescription}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b app-border-subtle text-left text-muted-foreground">
                <th className="px-2 py-2 font-medium">{copy.month}</th>
                <th className="px-2 py-2 font-medium">{copy.usedTokens}</th>
                <th className="px-2 py-2 font-medium">{copy.reservedTokens}</th>
              </tr>
            </thead>
            <tbody>
              {usageRows.map((row) => (
                <tr key={row.month_start} className="border-b app-border-subtle last:border-0">
                  <td className="px-2 py-2 text-foreground">
                    {formatUtcDate(
                      row.month_start,
                      {
                        year: "numeric",
                        month: "short",
                      },
                      locale,
                    )}
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
  );
}

export default async function DashboardUsagePage() {
  const t = await getTranslations("DashboardUsagePage");
  const locale = await getLocale();
  const { teamContext } = await getDashboardShellData();

  if (!teamContext) {
    return null;
  }

  return (
    <>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("header.eyebrow")}
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">{t("header.title")}</h1>
        <p className="mt-2 text-base text-muted-foreground">{t("header.description")}</p>
      </div>

      <Suspense fallback={<UsageTableSkeleton />}>
        <UsageTableSection
          teamId={teamContext.teamId}
          locale={locale}
          copy={{
            title: t("table.title"),
            noUsage: t("table.noUsage"),
            noUsageDescription: t("table.noUsageDescription"),
            month: t("table.month"),
            usedTokens: t("table.usedTokens"),
            reservedTokens: t("table.reservedTokens"),
          }}
        />
      </Suspense>
    </>
  );
}
