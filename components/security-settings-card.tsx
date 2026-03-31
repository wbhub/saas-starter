"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Shield } from "lucide-react";
import { logoutAllSessions } from "@/app/dashboard/actions";
import { DashboardPageSection } from "@/components/dashboard-page-section";
import { Button } from "@/components/ui/button";

type SecuritySettingsCardProps = {
  csrfToken: string;
};

export function SecuritySettingsCard({ csrfToken }: SecuritySettingsCardProps) {
  const t = useTranslations("SecuritySettingsCard");

  return (
    <DashboardPageSection icon={Shield} title={t("title")} description={t("description")}>
      <div className="flex flex-wrap gap-2">
        <form action={logoutAllSessions}>
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <Button type="submit" variant="outline" className="h-10 min-h-10 px-4 py-2">
            {t("actions.signOutAll")}
          </Button>
        </form>
        <Button
          render={<Link href="/forgot-password" />}
          className="h-10 min-h-10 px-4 py-2"
        >
          {t("actions.resetPassword")}
        </Button>
      </div>
    </DashboardPageSection>
  );
}
