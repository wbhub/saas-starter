import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { SHOW_LOCALE_SWITCHER } from "@/lib/i18n/config";

export function SiteHeader({ isLoggedIn }: { isLoggedIn: boolean }) {
  const t = useTranslations();

  return (
    <header className="border-b app-border-subtle">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-400 text-white shadow-sm shadow-indigo-500/30">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-semibold leading-tight tracking-tight">
              {t("Common.brandName")}
            </span>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {SHOW_LOCALE_SWITCHER ? <LocaleSwitcher /> : null}
          <ThemeToggle />
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            className="rounded-lg border app-border-subtle px-4 py-2 text-sm hover:bg-[color:var(--surface-subtle)]"
          >
            {isLoggedIn ? t("SiteHeader.dashboard") : t("SiteHeader.login")}
          </Link>
          <Link
            href={isLoggedIn ? "/dashboard" : "/signup"}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            {isLoggedIn ? t("SiteHeader.openApp") : t("SiteHeader.startFree")}
          </Link>
        </div>
      </nav>
    </header>
  );
}

