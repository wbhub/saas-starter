import { getTranslations } from "next-intl/server";
import { SupportEmailCard } from "@/components/support-email-card";

export default async function DashboardSupportPage() {
  const t = await getTranslations("DashboardSupportPage");

  return (
    <>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("header.eyebrow")}
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">{t("header.title")}</h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">{t("header.description")}</p>
      </div>

      <div className="space-y-6">
        <SupportEmailCard />
      </div>
    </>
  );
}
