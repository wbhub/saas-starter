import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("AuthPages");

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--background)] text-[color:var(--foreground)]">
      <SiteHeader isLoggedIn={false} />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <ForgotPasswordForm />
        <Link
          href="/login"
          className="mt-6 text-sm text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
        >
          {t("backLogin")}
        </Link>
      </main>

      <SiteFooter />
    </div>
  );
}
