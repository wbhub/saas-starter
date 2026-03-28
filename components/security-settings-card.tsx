import Link from "next/link";
import { useTranslations } from "next-intl";
import { logoutAllSessions } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";

type SecuritySettingsCardProps = {
  csrfToken: string;
};

export function SecuritySettingsCard({ csrfToken }: SecuritySettingsCardProps) {
  const t = useTranslations("SecuritySettingsCard");

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-2 text-muted-foreground">{t("description")}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <form action={logoutAllSessions}>
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <Button type="submit" variant="outline" className="text-muted-foreground">
            {t("actions.signOutAll")}
          </Button>
        </form>
        <Button
          render={<Link href="/forgot-password" />}
          className="bg-indigo-500 text-white hover:bg-indigo-400"
        >
          {t("actions.resetPassword")}
        </Button>
      </div>
    </section>
  );
}
