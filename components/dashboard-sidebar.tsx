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
  Home,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { DashboardTeamOption } from "@/lib/dashboard/server";
import { logout, switchActiveTeam } from "@/app/dashboard/actions";

type DashboardSidebarProps = {
  displayName: string;
  userEmail: string | null;
  teamName: string | null;
  role: "owner" | "admin" | "member";
  teamUiMode: "free" | "paid_solo" | "paid_team";
  showAiNav: boolean;
  activeTeamId: string;
  teamMemberships: DashboardTeamOption[];
  csrfToken: string;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function DashboardSidebar({
  displayName,
  userEmail,
  teamName,
  role,
  teamUiMode,
  showAiNav,
  activeTeamId,
  teamMemberships,
  csrfToken,
}: DashboardSidebarProps) {
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
    {
      label: t("DashboardSidebar.settings"),
      href: "/dashboard/settings",
      icon: Settings,
    },
  );
  if (teamUiMode !== "free") {
    navItems.splice(3, 0, {
      label:
        teamUiMode === "paid_solo"
          ? t("DashboardSidebar.inviteTeammates")
          : t("DashboardSidebar.team"),
      href: "/dashboard/team",
      icon: teamUiMode === "paid_solo" ? UserPlus : Users,
    });
  }

  function isNavItemActive(href: string) {
    if (href === "/dashboard") {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="flex flex-col lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
      {/* User info */}
      <div className="mb-1">
        <p className="truncate text-sm font-medium">{displayName}</p>
        <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
        {teamUiMode !== "free" && (
          <div className="mt-2 flex items-center gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {teamName ?? t("Common.myTeam")}
            </span>
            <Badge variant="secondary" className="capitalize">
              {role}
            </Badge>
          </div>
        )}
      </div>

      {/* Team switcher */}
      {teamUiMode !== "free" && teamMemberships.length > 1 ? (
        <>
          <Separator className="my-3" />
          <form action={switchActiveTeam} className="space-y-2">
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <input type="hidden" name="redirectTo" value={pathname} />
            <label
              htmlFor="active-team-select"
              className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              {t("DashboardSidebar.team")}
            </label>
            <div className="relative">
              <select
                id="active-team-select"
                name="teamId"
                defaultValue={activeTeamId}
                className="w-full appearance-none rounded-lg border bg-background py-1.5 pl-2.5 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {teamMemberships.map((membership) => (
                  <option key={membership.teamId} value={membership.teamId}>
                    {membership.teamName ?? t("Common.myTeam")}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            <Button type="submit" variant="outline" size="sm" className="w-full">
              {t("DashboardSidebar.switch")}
            </Button>
          </form>
        </>
      ) : null}

      <Separator className="my-3" />

      {/* Navigation */}
      <nav className="-mx-2 flex-1 space-y-0.5">
        {navItems.map((item) => {
          const isActive = isNavItemActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                isActive
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <Separator className="my-3" />
      <div className="flex gap-2">
        <Link
          href="/"
          className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border bg-background px-2.5 text-[0.8rem] font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Home className="h-3.5 w-3.5" />
          {t("DashboardSidebar.home")}
        </Link>
        <form action={logout} className="flex-1">
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <Button type="submit" size="sm" className="w-full">
            <LogOut className="h-3.5 w-3.5" />
            {t("DashboardSidebar.logout")}
          </Button>
        </form>
      </div>
    </aside>
  );
}
