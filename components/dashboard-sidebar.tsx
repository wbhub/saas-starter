"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { logout } from "@/app/dashboard/actions";

type DashboardSidebarProps = {
  displayName: string;
  userEmail: string | null;
  teamName: string | null;
  role: "owner" | "admin" | "member";
};

const navItems: Array<{ label: string; href: string }> = [
  { label: "Overview", href: "/dashboard" },
  { label: "Billing", href: "/dashboard/billing" },
  { label: "Team", href: "/dashboard/team" },
  { label: "Usage", href: "/dashboard/usage" },
  { label: "Settings", href: "/dashboard/settings" },
];

export function DashboardSidebar({
  displayName,
  userEmail,
  teamName,
  role,
}: DashboardSidebarProps) {
  const pathname = usePathname();

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
            App Dashboard
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">
            {teamName ?? "My Team"}
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="mt-5 rounded-lg app-surface-subtle px-3 py-2">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
          {displayName}
        </p>
        <p className="truncate text-xs text-slate-600 dark:text-slate-300">{userEmail}</p>
        <p className="mt-1 text-xs capitalize text-slate-600 dark:text-slate-300">{role}</p>
      </div>

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
          Home
        </Link>
        <form action={logout} className="flex-1">
          <button
            type="submit"
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Logout
          </button>
        </form>
      </div>
    </aside>
  );
}
