import { BarChart3 } from "lucide-react";
import { DashboardPageSection } from "@/components/dashboard-page-section";
import { formatUtcDate } from "@/lib/date";
import { getDashboardShellData, getUsageMonthlyTotals } from "@/lib/dashboard/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatTokens(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

export function AiUsageCardSkeleton() {
  return (
    <section className="rounded-xl bg-card ring-1 ring-border p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-muted" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    </section>
  );
}

export async function AiUsageCard({
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
    <DashboardPageSection icon={BarChart3} title={copy.title}>
      {usageRows.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <p className="text-sm font-medium text-foreground">{copy.noUsage}</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">{copy.noUsageDescription}</p>
        </div>
      ) : (
        <div>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border">
                <TableHead className="text-muted-foreground">{copy.month}</TableHead>
                <TableHead className="text-muted-foreground">{copy.usedTokens}</TableHead>
                <TableHead className="text-muted-foreground">{copy.reservedTokens}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usageRows.map((row) => (
                <TableRow key={row.month_start} className="border-b border-border last:border-0">
                  <TableCell className="text-foreground">
                    {formatUtcDate(
                      row.month_start,
                      {
                        year: "numeric",
                        month: "short",
                      },
                      locale,
                    )}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {formatTokens(row.used_tokens, locale)}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {formatTokens(row.reserved_tokens, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </DashboardPageSection>
  );
}
