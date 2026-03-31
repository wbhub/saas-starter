import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Matches dashboard billing sections (`DashboardBillingPage`) for visual consistency. */
export const dashboardPageSectionClass = "rounded-xl bg-card ring-1 ring-border p-6";

type DashboardPageSectionProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
  variant?: "default" | "destructive";
  /** When `variant` is `default`, controls icon tint. Ignored when `variant` is `destructive`. */
  iconTone?: "muted" | "primary" | "destructive";
  /**
   * When true, title + description align with `endSlot` in a row on larger screens (e.g. billing subscription header with badge).
   */
  borderedHeader?: boolean;
  /** Right side of a bordered header (e.g. status badge). */
  endSlot?: ReactNode;
  className?: string;
};

export function DashboardPageSection({
  icon: Icon,
  title,
  description,
  children,
  variant = "default",
  iconTone = "muted",
  borderedHeader = false,
  endSlot,
  className,
}: DashboardPageSectionProps) {
  const isDestructive = variant === "destructive";
  const tone = isDestructive ? "destructive" : iconTone;

  const iconBoxClass = cn(
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1",
    tone === "muted" && "bg-muted/80 text-muted-foreground ring-border",
    tone === "primary" && "bg-primary/10 text-primary ring-primary/20",
    tone === "destructive" && "bg-destructive/10 text-destructive ring-destructive/25",
  );

  const headerBlock = borderedHeader ? (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {endSlot}
    </div>
  ) : (
    <>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </>
  );

  return (
    <section
      className={cn(
        dashboardPageSectionClass,
        isDestructive &&
          "bg-destructive/5 ring-destructive/30 dark:bg-destructive/10 dark:ring-destructive/40",
        className,
      )}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div className={iconBoxClass}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          {headerBlock}
          {children != null ? <div className="mt-6">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
