import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { isPasswordAuthEnabled } from "@/lib/auth/social-auth";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default async function ForgotPasswordPage() {
  if (!isPasswordAuthEnabled()) {
    redirect("/login");
  }

  const t = await getTranslations("AuthPages");

  return (
    <div className="app-content flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <ForgotPasswordForm />
        <Link href="/login" className="mt-6 text-sm text-muted-foreground hover:text-foreground">
          {t("backLogin")}
        </Link>
      </main>

      <SiteFooter />
    </div>
  );
}
