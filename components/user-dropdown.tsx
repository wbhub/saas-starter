"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Cookies from "js-cookie";
import {
  Check,
  ChevronDown,
  CircleHelp,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Settings,
  SunMedium,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/components/theme-provider";
import { SHOW_LOCALE_SWITCHER } from "@/lib/i18n/config";
import { routing, type AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { logout, switchActiveTeam } from "@/app/dashboard/actions";
import type { DashboardTeamOption } from "@/lib/dashboard/server";

export type UserDropdownProps = {
  displayName: string;
  userEmail: string | null;
  avatarUrl: string | null;
  teamName: string | null;
  role: "owner" | "admin" | "member";
  teamUiMode: "free" | "paid_solo" | "paid_team";
  activeTeamId: string;
  teamMemberships: DashboardTeamOption[];
  csrfToken: string;
};

const LOCALE_COOKIE = "NEXT_LOCALE";

export function UserDropdown({
  displayName,
  userEmail,
  avatarUrl,
  teamName,
  role,
  teamUiMode,
  activeTeamId,
  teamMemberships,
  csrfToken,
}: UserDropdownProps) {
  const t = useTranslations();
  const tLocale = useTranslations("LocaleSwitcher");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocumentPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => document.removeEventListener("mousedown", onDocumentPointerDown);
  }, []);

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const themeOrder: Array<"system" | "light" | "dark"> = ["system", "light", "dark"];
  const themeIndex = themeOrder.indexOf(theme);
  const nextTheme = themeOrder[(themeIndex + 1) % themeOrder.length];
  const ThemeIcon = theme === "system" ? Monitor : theme === "light" ? SunMedium : Moon;

  function onLocaleChange(nextLocale: AppLocale) {
    if (nextLocale === locale) return;
    Cookies.set(LOCALE_COOKIE, nextLocale, { path: "/", expires: 365, sameSite: "lax" });
    setOpen(false);
    router.refresh();
  }

  const showTeamSwitcher = teamUiMode !== "free" && teamMemberships.length > 1;

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={t("UserDropdown.label")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar size="default">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t("UserDropdown.label")}
          className="absolute right-0 top-[calc(100%+0.4rem)] z-30 w-64 rounded-xl border app-border-subtle app-surface p-1.5 shadow-lg"
        >
          {/* User info */}
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
            {teamUiMode !== "free" && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="truncate text-xs text-muted-foreground">
                  {teamName ?? t("Common.myTeam")}
                </span>
                <Badge variant="secondary" className="capitalize text-[10px] px-1.5 py-0">
                  {role}
                </Badge>
              </div>
            )}
          </div>

          {/* Team switcher */}
          {showTeamSwitcher ? (
            <>
              <Separator className="my-1" />
              <form action={switchActiveTeam} className="px-2.5 py-1.5">
                <input type="hidden" name="csrf_token" value={csrfToken} />
                <input type="hidden" name="redirectTo" value={pathname} />
                <label
                  htmlFor="dropdown-team-select"
                  className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {t("DashboardSidebar.team")}
                </label>
                <div className="relative mt-1">
                  <select
                    id="dropdown-team-select"
                    name="teamId"
                    defaultValue={activeTeamId}
                    className="w-full appearance-none rounded-lg border bg-background py-1 pl-2 pr-6 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {teamMemberships.map((m) => (
                      <option key={m.teamId} value={m.teamId}>
                        {m.teamName ?? t("Common.myTeam")}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                </div>
                <button
                  type="submit"
                  className="mt-1.5 w-full rounded-lg border app-border-subtle px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-[color:var(--surface-subtle)]"
                >
                  {t("DashboardSidebar.switch")}
                </button>
              </form>
            </>
          ) : null}

          <Separator className="my-1" />

          {/* Preferences */}
          <div className="space-y-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => setTheme(nextTheme)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-[color:var(--surface-subtle)]"
            >
              <ThemeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t("UserDropdown.theme")}: {t(`UserDropdown.themeOptions.${theme}`)}
            </button>

            {SHOW_LOCALE_SWITCHER ? (
              <div>
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="true"
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-[color:var(--surface-subtle)]"
                  onClick={(e) => {
                    // Toggle display of the inline locale list
                    const list = e.currentTarget.nextElementSibling;
                    list?.classList.toggle("hidden");
                  }}
                >
                  <Languages className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {t("UserDropdown.language")}: {tLocale(`localeNames.${locale}`)}
                </button>
                <div className="hidden pl-7 pr-1 py-1">
                  {routing.locales.map((item) => {
                    const isActive = item === locale;
                    return (
                      <button
                        key={item}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isActive}
                        onClick={() => onLocaleChange(item)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                          isActive
                            ? "bg-[color:var(--surface-subtle)] text-foreground"
                            : "text-muted-foreground hover:bg-[color:var(--surface-subtle)] hover:text-foreground",
                        )}
                      >
                        <span>{tLocale(`localeNames.${item}`)}</span>
                        {isActive ? <Check className="h-3 w-3 text-indigo-500" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <Separator className="my-1" />

          {/* Navigation links */}
          <div className="space-y-0.5">
            <Link
              href="/dashboard/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-[color:var(--surface-subtle)]"
            >
              <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t("UserDropdown.settings")}
            </Link>
            <Link
              href="/dashboard/support"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-[color:var(--surface-subtle)]"
            >
              <CircleHelp className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t("UserDropdown.support")}
            </Link>
          </div>

          <Separator className="my-1" />

          {/* Logout */}
          <form action={logout}>
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-[color:var(--surface-subtle)]"
            >
              <LogOut className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t("UserDropdown.logout")}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
