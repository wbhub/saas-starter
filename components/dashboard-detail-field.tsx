import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const dashboardDetailLabelClassName =
  "text-xs font-medium leading-normal text-muted-foreground";

export const dashboardDetailValueClassName =
  "min-w-0 text-sm font-medium leading-relaxed text-foreground break-words [overflow-wrap:anywhere]";

export const dashboardDetailMonoValueClassName = cn(
  dashboardDetailValueClassName,
  "font-mono text-[0.9375rem]",
);

export const dashboardDetailTextBlockClassName = "min-w-0 space-y-0.5 leading-tight";

export const dashboardDetailGridClassName = "grid gap-4 sm:grid-cols-2 lg:gap-x-8 lg:gap-y-5";

/**
 * Label/value row: `text-xs` muted label, `text-sm` value — matches billing subscription
 * details. Pass `icon` for the optional leading tile (used on the billing page).
 */
export function DashboardDetailField({
  icon: Icon,
  label,
  children,
  valueClassName,
}: {
  icon?: LucideIcon;
  label: string;
  children: ReactNode;
  /** Applied to the value line (e.g. `font-mono break-all` for IDs). */
  valueClassName?: string;
}) {
  const textBlock = (
    <>
      <p className={dashboardDetailLabelClassName}>{label}</p>
      <div className={cn(dashboardDetailValueClassName, valueClassName)}>{children}</div>
    </>
  );

  if (!Icon) {
    return <div className={dashboardDetailTextBlockClassName}>{textBlock}</div>;
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/80 ring-1 ring-border">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <div className={cn(dashboardDetailTextBlockClassName, "flex-1")}>{textBlock}</div>
    </div>
  );
}
