import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const dashboardPageStackClassName = "space-y-5 sm:space-y-6";

type DashboardPageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  descriptionClassName?: string;
};

type DashboardPageStackProps = {
  children: ReactNode;
  className?: string;
};

export function DashboardPageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  descriptionClassName,
}: DashboardPageHeaderProps) {
  return (
    <header className={cn("space-y-2", className)}>
      <div
        className={cn(
          "flex flex-col gap-3",
          actions ? "sm:flex-row sm:items-end sm:justify-between" : undefined,
        )}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? (
            <p
              className={cn(
                "mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground",
                descriptionClassName,
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}

export function DashboardPageStack({ children, className }: DashboardPageStackProps) {
  return <div className={cn(dashboardPageStackClassName, className)}>{children}</div>;
}
