"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import type { DashboardTeamOption } from "@/lib/dashboard/server";
import { SHOW_LOCALE_SWITCHER } from "@/lib/i18n/config";
import { logout, switchActiveTeam } from "@/app/dashboard/actions";

type DashboardSidebarProps = {
  displayName: string;
  userEmail: string | null;
  teamName: string | null;
  role: "owner" | "admin" | "member";
  teamUiMode: "free" | "paid_solo" | "paid_team";
  activeTeamId: string;
  teamMemberships: DashboardTeamOption[];
  csrfToken: string;
};

export function DashboardSidebar({
  displayName,
  userEmail,
  teamName,
  role,
  teamUiMode,
  activeTeamId,
  teamMemberships,
  csrfToken,
}: DashboardSidebarProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const navItems: Array<{ label: string; href: string }> = [
    { label: t("DashboardSidebar.overview"), href: "/dashboard" },
    { label: t("DashboardSidebar.ai"), href: "/dashboard/ai" },
    { label: t("DashboardSidebar.billing"), href: "/dashboard/billing" },
    { label: t("DashboardSidebar.usage"), href: "/dashboard/usage" },
    { label: t("DashboardSidebar.settings"), href: "/dashboard/settings" },
  ];
  if (teamUiMode !== "free") {
    navItems.splice(3, 0, {
      label:
        teamUiMode === "paid_solo"
          ? t("DashboardSidebar.inviteTeammates")
          : t("DashboardSidebar.team"),
      href: "/dashboard/team",
    });
  }

  function isNavItemActive(href: string) {
    if (href === "/dashboard") {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="rounded-xl border app-border-subtle app-surface p-4 shadow-sm lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:min-h-[560px] lg:p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("DashboardSidebar.appDashboard")}
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">
            {teamUiMode === "free"
              ? t("DashboardSidebar.soloWorkspace")
              : (teamName ?? t("Common.myTeam"))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {SHOW_LOCALE_SWITCHER ? <LocaleSwitcher compact /> : null}
          <ThemeToggle />
        </div>
      </div>

      <div className="mt-5 rounded-lg app-surface-subtle px-3 py-2">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
          {displayName}
        </p>
        <p className="truncate text-xs text-slate-600 dark:text-slate-300">{userEmail}</p>
        {teamUiMode !== "free" ? (
          <p className="mt-1 text-xs capitalize text-slate-600 dark:text-slate-300">{role}</p>
        ) : null}
      </div>

      {teamUiMode !== "free" && teamMemberships.length > 1 ? (
        <form action={switchActiveTeam} className="mt-5 space-y-2">
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <input type="hidden" name="redirectTo" value={pathname} />
          <label
            htmlFor="active-team-select"
            className="block text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            {t("DashboardSidebar.team")}
          </label>
          <div className="flex gap-2">
            <select
              id="active-team-select"
              name="teamId"
              defaultValue={activeTeamId}
              className="min-w-0 flex-1 rounded-md border app-border-subtle app-surface px-2 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:text-slate-100 dark:focus:ring-slate-500"
            >
              {teamMemberships.map((membership) => (
                <option key={membership.teamId} value={membership.teamId}>
                  {membership.teamName ?? t("Common.myTeam")}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md border app-border-subtle px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              {t("DashboardSidebar.switch")}
            </button>
          </div>
        </form>
      ) : null}

      <nav className="mt-5 space-y-1">
        {navItems.map((item) => {
          const isActive = isNavItemActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`block rounded-md px-3 py-2 text-sm ${
                isActive
                  ? "bg-slate-900/10 font-medium text-slate-900 dark:bg-slate-100/10 dark:text-slate-50"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 flex gap-2 lg:mt-auto">
        <Link
          href="/"
          className="inline-flex flex-1 items-center justify-center rounded-md border app-border-subtle px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          {t("DashboardSidebar.home")}
        </Link>
        <form action={logout} className="flex-1">
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <button
            type="submit"
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {t("DashboardSidebar.logout")}
          </button>
        </form>
      </div>
    </aside>
  );
}
