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

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="flex flex-col rounded-2xl border app-border-subtle app-surface shadow-sm lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:min-h-[560px]">
      {/* User profile */}
      <div className="border-b app-border-subtle p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-emerald-400 text-sm font-semibold text-white shadow-sm">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </p>
            <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
          </div>
        </div>
        {teamUiMode !== "free" && (
          <div className="mt-3 flex items-center gap-2 rounded-lg app-surface-subtle px-3 py-1.5">
            <span className="truncate text-xs font-medium text-muted-foreground">
              {teamName ?? t("Common.myTeam")}
            </span>
            <span className="ml-auto rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium capitalize text-accent">
              {role}
            </span>
          </div>
        )}
      </div>

      {/* Team switcher */}
      {teamUiMode !== "free" && teamMemberships.length > 1 ? (
        <form
          action={switchActiveTeam}
          className="border-b app-border-subtle px-5 py-4"
        >
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <input type="hidden" name="redirectTo" value={pathname} />
          <label
            htmlFor="active-team-select"
            className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {t("DashboardSidebar.team")}
          </label>
          <div className="relative">
            <select
              id="active-team-select"
              name="teamId"
              defaultValue={activeTeamId}
              className="w-full appearance-none rounded-lg border app-border-subtle app-surface py-2 pl-3 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              {teamMemberships.map((membership) => (
                <option key={membership.teamId} value={membership.teamId}>
                  {membership.teamName ?? t("Common.myTeam")}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          <button
            type="submit"
            className="mt-2 w-full rounded-lg border app-border-subtle px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            {t("DashboardSidebar.switch")}
          </button>
        </form>
      ) : null}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Menu
        </p>
        {navItems.map((item) => {
          const isActive = isNavItemActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-gradient-to-r from-accent/10 to-accent/5 font-semibold text-accent"
                  : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${isActive ? "text-accent" : ""}`}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="border-t app-border-subtle p-4">
        <div className="flex gap-2">
          <Link
            href="/"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border app-border-subtle px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <Home className="h-3.5 w-3.5" />
            {t("DashboardSidebar.home")}
          </Link>
          <form action={logout} className="flex-1">
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-btn-primary px-3 py-2 text-sm font-medium text-btn-primary-text transition-colors hover:bg-btn-primary-hover"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("DashboardSidebar.logout")}
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
