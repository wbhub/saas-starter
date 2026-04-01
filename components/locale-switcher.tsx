"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Languages } from "lucide-react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { routing, type AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

const LOCALE_COOKIE = "NEXT_LOCALE";

type LocaleSwitcherProps = {
  className?: string;
};

export function LocaleSwitcher({ className }: LocaleSwitcherProps) {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const t = useTranslations("LocaleSwitcher");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocumentPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentPointerDown);
    };
  }, []);

  function onLocaleChange(nextLocale: AppLocale) {
    if (nextLocale === locale) {
      setOpen(false);
      return;
    }

    Cookies.set(LOCALE_COOKIE, nextLocale, {
      path: "/",
      expires: 365,
      sameSite: "lax",
    });
    setOpen(false);
    router.refresh();
  }

  const getLocaleLabel = (value: AppLocale) => t(`localeNames.${value}`);
  const currentLabel = getLocaleLabel(locale);

  return (
    <div ref={containerRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-label={`${t("label")}: ${currentLabel}`}
        title={currentLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Languages className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t("label")}
          className="absolute right-0 top-[calc(100%+0.4rem)] z-30 min-w-40 rounded-xl border border-border bg-card p-1.5 shadow-lg"
        >
          {routing.locales.map((item) => {
            const isActive = item === locale;
            const localeLabel = getLocaleLabel(item);

            return (
              <button
                key={item}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => onLocaleChange(item)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <span>{localeLabel}</span>
                {isActive ? <Check className="h-4 w-4 text-primary" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
