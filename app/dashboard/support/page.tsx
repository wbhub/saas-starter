import { getTranslations } from "next-intl/server";
import { DashboardPageHeader, DashboardPageStack } from "@/components/dashboard-page-header";
import { SupportEmailCard } from "@/components/support-email-card";

export default async function DashboardSupportPage() {
  const t = await getTranslations("DashboardSupportPage");

  return (
    <>
      <DashboardPageStack>
        <DashboardPageHeader
          eyebrow={t("header.eyebrow")}
          title={t("header.title")}
          description={t("header.description")}
        />
        <SupportEmailCard />
      </DashboardPageStack>
    </>
  );
}
