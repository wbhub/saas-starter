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
  Loader2,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Settings,
  SunMedium,
  User,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clientFetch } from "@/lib/http/client-fetch";
import { useTheme } from "@/components/theme-provider";
import { SHOW_LOCALE_SWITCHER } from "@/lib/i18n/config";
import { routing, type AppLocale } from "@/i18n/routing";
import { logout, switchActiveTeam } from "@/app/dashboard/actions";
import type { DashboardTeamOption } from "@/lib/dashboard/server";

export type UserDropdownProps = {
  displayName: string;
  userEmail: string | null;
  avatarUrl: string | null;
  teamName: string | null;
  role: "owner" | "admin" | "member";
  teamUiMode: "free" | "paid_solo" | "paid_team";
  canSwitchTeams: boolean | null;
  activeTeamId: string;
  csrfToken: string;
};

type TeamOptionsResponse = {
  ok: true;
  teams: DashboardTeamOption[];
};

const LOCALE_COOKIE = "NEXT_LOCALE";

export function UserDropdown({
  displayName,
  userEmail,
  avatarUrl,
  teamName,
  role,
  teamUiMode,
  canSwitchTeams,
  activeTeamId,
  csrfToken,
}: UserDropdownProps) {
  const t = useTranslations();
  const tLocale = useTranslations("LocaleSwitcher");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [showLocales, setShowLocales] = useState(false);
  const [teamOptions, setTeamOptions] = useState<DashboardTeamOption[]>([]);
  const [teamOptionsState, setTeamOptionsState] = useState<"idle" | "loading" | "loaded" | "error">(
    canSwitchTeams === false ? "loaded" : "idle",
  );
  const logoutFormRef = useRef<HTMLFormElement | null>(null);
  const teamSwitchFormRef = useRef<HTMLFormElement | null>(null);
  const teamSwitchingDisabled = canSwitchTeams === false;
  const teamSwitchingAvailableOrUnknown = !teamSwitchingDisabled;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setShowLocales(false);
    }
    if (nextOpen && teamSwitchingAvailableOrUnknown) {
      setTeamOptions([]);
      setTeamOptionsState("loading");
    }
    if (!nextOpen) {
      if (teamSwitchingDisabled || teamOptionsState !== "error") {
        return;
      }
      setTeamOptions([]);
      setTeamOptionsState("idle");
    }
  }

  useEffect(() => {
    if (!open || teamSwitchingDisabled || teamOptionsState !== "loading") {
      return;
    }

    let cancelled = false;

    clientFetch("/api/team/options", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as TeamOptionsResponse;
        if (cancelled) {
          return;
        }

        setTeamOptions(payload.teams);
        setTeamOptionsState("loaded");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setTeamOptions([]);
        setTeamOptionsState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [open, teamOptionsState, teamSwitchingDisabled]);

  const themeOrder: Array<"system" | "light" | "dark"> = ["system", "light", "dark"];
  const themeIndex = themeOrder.indexOf(theme);
  const nextTheme = themeOrder[(themeIndex + 1) % themeOrder.length];
  const ThemeIcon = theme === "system" ? Monitor : theme === "light" ? SunMedium : Moon;

  function onLocaleChange(nextLocale: string) {
    if (nextLocale === locale) return;
    Cookies.set(LOCALE_COOKIE, nextLocale, { path: "/", expires: 365, sameSite: "lax" });
    setOpen(false);
    router.refresh();
  }

  const showTeamSwitcher = teamSwitchingAvailableOrUnknown && teamOptions.length > 1;
  const showTeamSwitcherLoading = teamSwitchingAvailableOrUnknown && teamOptionsState === "loading";

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        aria-label={t("UserDropdown.label")}
        className="inline-flex items-center gap-2.5 rounded-full border border-border py-1.5 pl-1.5 pr-3 shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar size="default">
          <AvatarImage src={avatarUrl ?? ""} alt={displayName} />
          <AvatarFallback className="text-foreground">
            <User className="size-3.5 shrink-0" aria-hidden />
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-sm font-medium sm:inline">{displayName}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={6} className="w-64 rounded-xl p-1.5">
        {/* User info */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2.5 py-2">
            <div>
              <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
              {(teamUiMode !== "free" || canSwitchTeams === true) && (
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
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        {/* Team switcher */}
        {showTeamSwitcher ? (
          <>
            <DropdownMenuSeparator />
            <div
              className="px-2.5 py-1.5"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <form ref={teamSwitchFormRef} action={switchActiveTeam}>
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
                    {teamOptions.map((m) => (
                      <option key={m.teamId} value={m.teamId}>
                        {m.teamName ?? t("Common.myTeam")}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                </div>
                <button
                  type="submit"
                  className="mt-1.5 w-full rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  {t("DashboardSidebar.switch")}
                </button>
              </form>
            </div>
          </>
        ) : null}

        {showTeamSwitcherLoading ? (
          <>
            <DropdownMenuSeparator />
            <div className="px-2.5 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("DashboardSidebar.team")}
              </div>
            </div>
          </>
        ) : null}

        <DropdownMenuSeparator />

        {/* Preferences */}
        <DropdownMenuItem
          onClick={() => setTheme(nextTheme)}
          closeOnClick={false}
          className="gap-2.5 rounded-lg px-2.5 py-2"
        >
          <ThemeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          {t("UserDropdown.theme")}: {t(`UserDropdown.themeOptions.${theme}`)}
        </DropdownMenuItem>

        {SHOW_LOCALE_SWITCHER ? (
          <>
            <DropdownMenuItem
              onClick={() => setShowLocales((prev) => !prev)}
              closeOnClick={false}
              className="gap-2.5 rounded-lg px-2.5 py-2"
            >
              <Languages className="h-4 w-4 shrink-0 text-muted-foreground" />
              {t("UserDropdown.language")}: {tLocale(`localeNames.${locale}`)}
              <ChevronDown
                className={`ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${showLocales ? "rotate-180" : ""}`}
              />
            </DropdownMenuItem>
            {showLocales
              ? routing.locales.map((item) => (
                  <DropdownMenuItem
                    key={item}
                    onClick={() => onLocaleChange(item)}
                    className="gap-2.5 rounded-lg py-1.5 pl-11 pr-2.5"
                  >
                    {tLocale(`localeNames.${item}`)}
                    {item === locale ? (
                      <Check className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    ) : null}
                  </DropdownMenuItem>
                ))
              : null}
          </>
        ) : null}

        <DropdownMenuSeparator />

        {/* Navigation links */}
        <DropdownMenuItem
          className="gap-2.5 rounded-lg px-2.5 py-2"
          render={<Link href="/dashboard/settings" />}
        >
          <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
          {t("UserDropdown.settings")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2.5 rounded-lg px-2.5 py-2"
          render={<Link href="/dashboard/support" />}
        >
          <CircleHelp className="h-4 w-4 shrink-0 text-muted-foreground" />
          {t("UserDropdown.support")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Logout */}
        <form ref={logoutFormRef} action={logout} className="hidden">
          <input type="hidden" name="csrf_token" value={csrfToken} />
        </form>
        <DropdownMenuItem
          className="gap-2.5 rounded-lg px-2.5 py-2"
          onClick={() => logoutFormRef.current?.requestSubmit()}
        >
          <LogOut className="h-4 w-4 shrink-0 text-muted-foreground" />
          {t("UserDropdown.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
