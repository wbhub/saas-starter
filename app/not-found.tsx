import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  const common = await getTranslations("Common");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Link
        href="/"
        className="mb-10 flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-400 text-white shadow-sm shadow-indigo-500/30">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="text-xl font-semibold tracking-tight">
          {common("brandName")}
        </span>
      </Link>

      <p className="text-6xl font-bold tracking-tight">404</p>
      <h1 className="mt-4 text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        {t("description")}
      </p>

      <div className="mt-8 flex gap-4">
        <Link
          href="/"
          className="rounded-lg border app-border-subtle px-4 py-2 text-sm font-medium hover:bg-surface-subtle"
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
  );
}
