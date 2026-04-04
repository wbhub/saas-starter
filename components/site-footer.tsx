import Link from "next/link";
import { useTranslations } from "next-intl";
import { DashboardShellFrame, DashboardShellSection, PublicShell } from "./layout-shells";
import { dashboardShellColumnsClassName } from "@/lib/site-layout";
import { cn } from "@/lib/utils";

type SiteFooterProps = {
  dashboard?: boolean;
};

export function SiteFooter({ dashboard = false }: SiteFooterProps) {
  const t = useTranslations("SiteFooter");
  const FooterShell = dashboard ? DashboardShellFrame : PublicShell;
  const legalLinks = (
    <div className="flex items-center gap-4">
      <Link href="/privacy-policy" className="transition-colors hover:text-foreground">
        {t("privacyPolicy")}
      </Link>
      <Link href="/terms-of-use" className="transition-colors hover:text-foreground">
        {t("termsOfUse")}
      </Link>
    </div>
  );

  return (
    <footer className="border-t border-border">
      <FooterShell className="py-6 text-sm text-muted-foreground">
        <div
          className={
            dashboard
              ? cn("flex flex-col gap-3 lg:grid lg:items-center", dashboardShellColumnsClassName)
              : "flex flex-col justify-between gap-3 md:flex-row md:items-center"
          }
        >
          <p>
            &copy; {new Date().getFullYear()} {t("companyPlaceholder")}
          </p>
          {dashboard ? (
            <div className="min-w-0">
              <DashboardShellSection className="flex items-center gap-4 lg:justify-end">
                {legalLinks}
              </DashboardShellSection>
            </div>
          ) : (
            legalLinks
          )}
        </div>
      </FooterShell>
    </footer>
  );
}
