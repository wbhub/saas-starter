import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/auth-form";
import {
  getEnabledSocialAuthProviders,
  LAST_AUTH_PROVIDER_COOKIE,
  parseAuthProvider,
} from "@/lib/auth/social-auth";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";

export default async function SignupPage() {
  const t = await getTranslations("AuthPages");
  const supabase = await createClient();
  const cookieStore = await cookies();
  const socialProviders = getEnabledSocialAuthProviders();
  const lastUsedProvider = parseAuthProvider(cookieStore.get(LAST_AUTH_PROVIDER_COOKIE)?.value);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="app-content flex min-h-screen flex-col bg-[color:var(--background)] text-[color:var(--foreground)]">
      <SiteHeader isLoggedIn={false} />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <AuthForm
          mode="signup"
          socialProviders={socialProviders}
          lastUsedProvider={lastUsedProvider}
        />
        <Link
          href="/"
          className="mt-6 text-sm text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
        >
          {t("backHome")}
        </Link>
      </main>

      <SiteFooter />
    </div>
  );
}
