import Link from "next/link";
import { useTranslations } from "next-intl";

export function SiteFooter() {
  const t = useTranslations("SiteFooter");

  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-6 py-4 text-xs text-muted-foreground md:flex-row md:items-center">
        <p>
          &copy; {new Date().getFullYear()} {t("companyPlaceholder")}
        </p>
        <div className="flex items-center gap-4">
          <Link href="/privacy-policy" className="transition-colors hover:text-foreground">
            {t("privacyPolicy")}
          </Link>
          <Link href="/terms-of-use" className="transition-colors hover:text-foreground">
            {t("termsOfUse")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
