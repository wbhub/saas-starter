import Link from "next/link";
import { useTranslations } from "next-intl";

export function SiteFooter({ wide }: { wide?: boolean }) {
  const t = useTranslations("SiteFooter");

  return (
    <footer className="border-t app-border-subtle">
      <div
        className={`mx-auto flex flex-col justify-between gap-3 px-6 py-6 text-sm text-muted-foreground md:flex-row md:items-center ${wide ? "max-w-[1600px] lg:px-10" : "max-w-7xl"}`}
      >
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
