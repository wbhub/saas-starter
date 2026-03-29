import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { PublicHeaderActions } from "./public-header-actions";
import { UserDropdown, type UserDropdownProps } from "./user-dropdown";
import { env } from "@/lib/env";

type SiteHeaderProps = {
  dashboardUser?: UserDropdownProps;
  hideOpenApp?: boolean;
};

export function SiteHeader(props: SiteHeaderProps) {
  const t = useTranslations();

  return (
    <header className="border-b app-border-subtle">
      <nav className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-5 lg:px-10">
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
          {props.dashboardUser ? (
            <UserDropdown
              key={[
                props.dashboardUser.activeTeamId,
                props.dashboardUser.teamName ?? "",
                props.dashboardUser.role,
                props.dashboardUser.teamUiMode,
              ].join(":")}
              {...props.dashboardUser}
            />
          ) : (
            <PublicHeaderActions
              loginLabel={t("SiteHeader.login")}
              signupLabel={t(
                env.APP_FREE_PLAN_ENABLED ? "SiteHeader.startFree" : "SiteHeader.getStarted",
              )}
              openAppLabel={t("SiteHeader.openApp")}
              hideOpenApp={props.hideOpenApp}
            />
          )}
        </div>
      </nav>
    </header>
  );
}
