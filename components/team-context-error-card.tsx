import { useTranslations } from "next-intl";

export function TeamContextErrorCard() {
  const t = useTranslations("TeamContextErrorCard");

  return (
    <section className="mx-auto mt-16 max-w-xl rounded-xl border border-border bg-card p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>
    </section>
  );
}
