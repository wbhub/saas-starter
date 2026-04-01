import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default async function NotFound() {
  const t = await getTranslations("NotFound");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-12 text-center">
        <div>
          <p className="text-6xl font-bold tracking-tight">404</p>
          <h1 className="mt-4 text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-2 max-w-md text-muted-foreground">{t("description")}</p>

          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              {t("goHome")}
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              {t("goDashboard")}
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
