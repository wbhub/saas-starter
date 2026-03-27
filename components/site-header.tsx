import Link from "next/link";
import { useTranslations } from "next-intl";

import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { SHOW_LOCALE_SWITCHER } from "@/lib/i18n/config";

export function SiteHeader({ isLoggedIn }: { isLoggedIn: boolean }) {
  const t = useTranslations();

  return (
    <header className="border-b app-border-subtle">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M8 1L14.9282 5V11L8 15L1.07179 11V5L8 1Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            {t("Common.brandName")}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {SHOW_LOCALE_SWITCHER ? <LocaleSwitcher /> : null}
          <ThemeToggle />
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="ml-1 rounded-lg bg-btn-primary px-3.5 py-1.5 text-[13px] font-medium text-btn-primary-text transition-colors hover:bg-btn-primary-hover"
            >
              {t("SiteHeader.openApp")}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("SiteHeader.login")}
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-btn-primary px-3.5 py-1.5 text-[13px] font-medium text-btn-primary-text transition-colors hover:bg-btn-primary-hover"
              >
                {t("SiteHeader.startFree")}
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
