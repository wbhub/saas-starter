import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { DashboardShellFrame, DashboardShellSection, PublicShell } from "./layout-shells";
import { PublicHeaderActions } from "./public-header-actions";
import { UserDropdown, type UserDropdownProps } from "./user-dropdown";
import { DashboardMobileNav } from "@/components/dashboard-mobile-nav";
import { env } from "@/lib/env";
import { dashboardShellColumnsClassName } from "@/lib/site-layout";
import { cn } from "@/lib/utils";

type SiteHeaderProps = {
  dashboardUser?: UserDropdownProps;
  dashboardNav?: {
    teamUiMode: "free" | "paid_solo" | "paid_team";
    showAiNav: boolean;
  };
};

export function SiteHeader(props: SiteHeaderProps) {
  const t = useTranslations();
  const brandHref = props.dashboardUser ? "/dashboard" : "/";
  const NavShell = props.dashboardUser ? DashboardShellFrame : PublicShell;
  const brand = (
    <div className="flex min-w-0 items-center gap-3">
      {props.dashboardNav ? (
        <DashboardMobileNav
          teamUiMode={props.dashboardNav.teamUiMode}
          showAiNav={props.dashboardNav.showAiNav}
        />
      ) : null}
      <Link
        href={brandHref}
        className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-success text-white shadow-sm shadow-primary/30">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="truncate text-lg font-semibold leading-tight tracking-tight sm:text-xl">
          {t("Common.brandName")}
        </span>
      </Link>
    </div>
  );
  const actions = props.dashboardUser ? (
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
      signupLabel={t(env.APP_FREE_PLAN_ENABLED ? "SiteHeader.startFree" : "SiteHeader.getStarted")}
      openAppLabel={t("SiteHeader.openApp")}
    />
  );

  return (
    <header className="border-b border-border">
      <NavShell as="nav" className="py-4 sm:py-5">
        {props.dashboardUser ? (
          <div
            className={cn(
              "flex items-center justify-between gap-3 lg:grid lg:items-center",
              dashboardShellColumnsClassName,
            )}
          >
            {brand}
            <div className="min-w-0">
              <DashboardShellSection className="flex items-center justify-end gap-3">
                {actions}
              </DashboardShellSection>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            {brand}
            <div className="flex items-center gap-3">{actions}</div>
          </div>
        )}
      </NavShell>
    </header>
  );
}
