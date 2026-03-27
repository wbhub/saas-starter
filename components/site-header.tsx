import Link from "next/link";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { SHOW_LOCALE_SWITCHER } from "@/lib/i18n/config";

export function SiteHeader({ isLoggedIn }: { isLoggedIn: boolean }) {
  const t = useTranslations();

  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L14.9282 5V11L8 15L1.07179 11V5L8 1Z" fill="currentColor" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight">
            {t("Common.brandName")}
          </span>
        </Link>
        <div className="flex items-center gap-1.5">
          {SHOW_LOCALE_SWITCHER ? <LocaleSwitcher /> : null}
          <ThemeToggle />
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="ml-1 inline-flex h-7 items-center justify-center rounded-lg bg-primary px-3 text-[0.8rem] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("SiteHeader.openApp")}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-[0.8rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {t("SiteHeader.login")}
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-7 items-center justify-center rounded-lg bg-primary px-3 text-[0.8rem] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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
