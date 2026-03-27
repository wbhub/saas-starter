import Link from "next/link";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
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
            <Link href="/dashboard" className={buttonVariants({ size: "sm", className: "ml-1" })}>
              {t("SiteHeader.openApp")}
            </Link>
          ) : (
            <>
              <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                {t("SiteHeader.login")}
              </Link>
              <Link href="/signup" className={buttonVariants({ size: "sm" })}>
                {t("SiteHeader.startFree")}
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
