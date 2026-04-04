import type { ElementType, ReactNode } from "react";
import {
  dashboardContentRailClassName,
  dashboardShellColumnsClassName,
  publicContainerClassName,
  siteContainerClassName,
} from "@/lib/site-layout";
import { cn } from "@/lib/utils";

type LayoutShellProps = {
  as?: ElementType;
  children: ReactNode;
  className?: string;
};

type DashboardShellColumnsProps = {
  children: ReactNode;
  className?: string;
};

export function PublicShell({ as: Component = "div", children, className }: LayoutShellProps) {
  return <Component className={cn(publicContainerClassName, className)}>{children}</Component>;
}

export function DashboardShellFrame({
  as: Component = "div",
  children,
  className,
}: LayoutShellProps) {
  return <Component className={cn(siteContainerClassName, className)}>{children}</Component>;
}

export function DashboardShellColumns({ children, className }: DashboardShellColumnsProps) {
  return (
    <div className={cn("grid items-start gap-6", dashboardShellColumnsClassName, className)}>
      {children}
    </div>
  );
}

export function DashboardShellSection({
  as: Component = "div",
  children,
  className,
}: LayoutShellProps) {
  return <Component className={cn(dashboardContentRailClassName, className)}>{children}</Component>;
}

export function PublicCenteredContent({
  as: Component = "div",
  children,
  className,
}: LayoutShellProps) {
  return (
    <Component
      className={cn(
        "mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center",
        className,
      )}
    >
      {children}
    </Component>
  );
}
