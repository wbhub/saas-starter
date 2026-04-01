import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { AcceptInviteErrorCode } from "@/lib/team-invites/accept-invite";

const TRANSLATABLE_CODES = [
  "not_found",
  "expired",
  "email_mismatch",
  "team_full",
  "no_email",
] as const;

export async function InviteErrorCard({ errorCode }: { errorCode: AcceptInviteErrorCode }) {
  const t = await getTranslations("InviteErrorCard");

  const messageKey = TRANSLATABLE_CODES.includes(errorCode as (typeof TRANSLATABLE_CODES)[number])
    ? (`errors.${errorCode}` as const)
    : "errors.default";

  return (
    <section className="mx-auto w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t(messageKey)}</p>
      <Link
        href="/dashboard"
        className="mt-5 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
      >
        {t("goDashboard")}
      </Link>
    </section>
  );
}
