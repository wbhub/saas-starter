import Link from "next/link";
import { useTranslations } from "next-intl";
import { logoutAllSessions } from "@/app/dashboard/actions";

type SecuritySettingsCardProps = {
  csrfToken: string;
};

export function SecuritySettingsCard({ csrfToken }: SecuritySettingsCardProps) {
  const t = useTranslations("SecuritySettingsCard");

  return (
    <section className="rounded-xl border app-border-subtle app-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <form action={logoutAllSessions}>
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <button
            type="submit"
            className="rounded-lg border app-border-subtle px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-hover"
          >
            {t("actions.signOutAll")}
          </button>
        </form>
        <Link
          href="/forgot-password"
          className="rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-text hover:bg-btn-primary-hover"
        >
          {t("actions.resetPassword")}
        </Link>
      </div>
    </section>
  );
}
