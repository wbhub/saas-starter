"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Sparkles,
  CreditCard,
  BarChart3,
  Settings,
  Users,
  UserPlus,
  CircleHelp,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

type DashboardSidebarProps = {
  teamUiMode: "free" | "paid_solo" | "paid_team";
  showAiNav: boolean;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function DashboardSidebar({ teamUiMode, showAiNav }: DashboardSidebarProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const navItems: NavItem[] = [
    {
      label: t("DashboardSidebar.overview"),
      href: "/dashboard",
      icon: LayoutDashboard,
    },
  ];
  if (showAiNav) {
    navItems.push({
      label: t("DashboardSidebar.ai"),
      href: "/dashboard/ai",
      icon: Sparkles,
    });
  }
  navItems.push(
    {
      label: t("DashboardSidebar.billing"),
      href: "/dashboard/billing",
      icon: CreditCard,
    },
    {
      label: t("DashboardSidebar.usage"),
      href: "/dashboard/usage",
      icon: BarChart3,
    },
  );
  if (teamUiMode !== "free") {
    navItems.push({
      label:
        teamUiMode === "paid_solo"
          ? t("DashboardSidebar.inviteTeammates")
          : t("DashboardSidebar.team"),
      href: "/dashboard/team",
      icon: teamUiMode === "paid_solo" ? UserPlus : Users,
    });
  }
  navItems.push(
    {
      label: t("DashboardSidebar.settings"),
      href: "/dashboard/settings",
      icon: Settings,
    },
    {
      label: t("DashboardSidebar.support"),
      href: "/dashboard/support",
      icon: CircleHelp,
    },
  );

  function isNavItemActive(href: string) {
    if (href === "/dashboard") {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="flex flex-col lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)]">
      <Separator className="mb-3 lg:hidden" />

      {/* Navigation */}
      <nav className="-mx-2.5 flex-1 space-y-1">
        {navItems.map((item) => {
          const isActive = isNavItemActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors ${
                isActive
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
