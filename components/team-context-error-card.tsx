import { useTranslations } from "next-intl";

export function TeamContextErrorCard() {
  const t = useTranslations("TeamContextErrorCard");

  return (
    <section className="mx-auto mt-16 max-w-xl rounded-xl border app-border-subtle app-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {t("description")}
      </p>
    </section>
  );
}
