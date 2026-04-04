"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CircleHelp,
  CreditCard,
  LayoutDashboard,
  Settings,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type DashboardTeamUiMode = "free" | "paid_solo" | "paid_team";

type DashboardNavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

type DashboardNavProps = {
  teamUiMode: DashboardTeamUiMode;
  showAiNav: boolean;
  onNavigate?: () => void;
  className?: string;
  linkClassName?: string;
};

function buildDashboardNavItems(
  translate: (key: string) => string,
  teamUiMode: DashboardTeamUiMode,
  showAiNav: boolean,
): DashboardNavItem[] {
  const navItems: DashboardNavItem[] = [
    {
      label: translate("DashboardSidebar.overview"),
      href: "/dashboard",
      icon: LayoutDashboard,
    },
  ];

  if (showAiNav) {
    navItems.push({
      label: translate("DashboardSidebar.ai"),
      href: "/dashboard/ai",
      icon: Sparkles,
    });
  }

  if (teamUiMode !== "free") {
    navItems.push({
      label: translate("DashboardSidebar.team"),
      href: "/dashboard/team",
      icon: teamUiMode === "paid_solo" ? UserPlus : Users,
    });
  }

  navItems.push(
    {
      label: translate("DashboardSidebar.billing"),
      href: "/dashboard/billing",
      icon: CreditCard,
    },
    {
      label: translate("DashboardSidebar.settings"),
      href: "/dashboard/settings",
      icon: Settings,
    },
    {
      label: translate("DashboardSidebar.support"),
      href: "/dashboard/support",
      icon: CircleHelp,
    },
  );

  return navItems;
}

export function isDashboardNavItemActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function useDashboardNavState(teamUiMode: DashboardTeamUiMode, showAiNav: boolean) {
  const t = useTranslations();
  const pathname = usePathname();
  const items = buildDashboardNavItems(t, teamUiMode, showAiNav);
  const activeItem =
    items.find((item) => isDashboardNavItemActive(pathname, item.href)) ?? items[0] ?? null;

  return {
    activeItem,
    items,
    pathname,
  };
}

export function DashboardNav({
  teamUiMode,
  showAiNav,
  onNavigate,
  className,
  linkClassName,
}: DashboardNavProps) {
  const { items, pathname } = useDashboardNavState(teamUiMode, showAiNav);

  return (
    <nav className={cn("space-y-1", className)}>
      {items.map((item) => {
        const isActive = isDashboardNavItemActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onNavigate?.()}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors",
              isActive
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              linkClassName,
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="min-w-0 truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
