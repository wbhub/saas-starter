import Link from "next/link";
import { useTranslations } from "next-intl";

export function SiteFooter() {
  const t = useTranslations("SiteFooter");

  return (
    <footer className="border-t app-border-subtle">
      <div className="app-muted mx-auto flex max-w-7xl flex-col justify-between gap-3 px-6 py-6 text-sm md:flex-row md:items-center">
        <p>
          © {new Date().getFullYear()} {t("companyPlaceholder")}
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <Link href="/privacy-policy">{t("privacyPolicy")}</Link>
          <Link href="/terms-of-use">{t("termsOfUse")}</Link>
        </div>
      </div>
    </footer>
  );
}
