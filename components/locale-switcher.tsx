"use client";

import { Languages } from "lucide-react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  function onLocaleChange(nextLocale: AppLocale) {
    if (nextLocale === locale) {
      return;
    }

    Cookies.set(LOCALE_COOKIE, nextLocale, {
      path: "/",
      expires: 365,
      sameSite: "lax",
    });
    router.refresh();
  }

  const getLocaleLabel = (value: AppLocale) => t(`localeNames.${value}`);
  const currentLabel = getLocaleLabel(locale);

  return (
    <div className={cn("inline-flex", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${t("label")}: ${currentLabel}`}
          title={currentLabel}
          className={cn(
            buttonVariants({ variant: "outline", size: "icon-lg" }),
            "rounded-full shadow-sm",
          )}
        >
          <Languages className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="min-w-40 rounded-xl p-1.5">
          <DropdownMenuRadioGroup
            value={locale}
            onValueChange={(value) => onLocaleChange(value as AppLocale)}
          >
            {routing.locales.map((item) => (
              <DropdownMenuRadioItem
                key={item}
                value={item}
                closeOnClick
                className="gap-2.5 rounded-lg px-2.5 py-2"
              >
                {getLocaleLabel(item)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
