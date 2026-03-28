import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserDropdown, type UserDropdownProps } from "./user-dropdown";
import { SHOW_LOCALE_SWITCHER } from "@/lib/i18n/config";

type SiteHeaderProps =
  | { isLoggedIn: boolean; dashboardUser?: undefined }
  | { isLoggedIn?: undefined; dashboardUser: UserDropdownProps };

export function SiteHeader(props: SiteHeaderProps) {
  const t = useTranslations();
  const isDashboard = !!props.dashboardUser;

  return (
    <header className="border-b app-border-subtle">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-400 text-white shadow-sm shadow-indigo-500/30">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-xl font-semibold leading-tight tracking-tight">
            {t("Common.brandName")}
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {isDashboard ? (
            <UserDropdown {...props.dashboardUser} />
          ) : (
            <>
              {SHOW_LOCALE_SWITCHER ? <LocaleSwitcher /> : null}
              <ThemeToggle />
              {props.isLoggedIn ? (
                <Link
                  href="/dashboard"
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
                >
                  {t("SiteHeader.openApp")}
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="rounded-lg border app-border-subtle px-4 py-2 text-sm hover:bg-[color:var(--surface-subtle)]"
                  >
                    {t("SiteHeader.login")}
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
                  >
                    {t("SiteHeader.startFree")}
                  </Link>
                </>
              )}
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
