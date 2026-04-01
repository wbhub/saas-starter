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

function getSafeNextPath(nextValue: string | string[] | undefined) {
  const next = Array.isArray(nextValue) ? nextValue[0] : nextValue;
  if (!next) {
    return "/dashboard";
  }

  if (/[\u0000-\u001F\u007F]/.test(next) || next.includes("\\") || next.startsWith("//")) {
    return "/dashboard";
  }
  try {
    const decoded = decodeURIComponent(next);
    if (decoded.includes("\\") || decoded.startsWith("//") || decoded.startsWith("/\\")) {
      return "/dashboard";
    }
  } catch {
    return "/dashboard";
  }

  try {
    const parsed = new URL(next, "http://localhost");
    if (parsed.origin !== "http://localhost" || !parsed.pathname.startsWith("/")) {
      return "/dashboard";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const t = await getTranslations("AuthPages");
  const supabase = await createClient();
  const cookieStore = await cookies();
  const params = await searchParams;
  const safeNext = getSafeNextPath(params.next);
  const socialProviders = getEnabledSocialAuthProviders();
  const lastUsedProvider = parseAuthProvider(cookieStore.get(LAST_AUTH_PROVIDER_COOKIE)?.value);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(safeNext);
  }

  return (
    <div className="app-content flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <AuthForm
          mode="login"
          redirectTo={safeNext}
          socialProviders={socialProviders}
          lastUsedProvider={lastUsedProvider}
        />
        <Link
          href="/"
          className="mt-6 text-sm text-muted-foreground hover:text-foreground"
        >
          {t("backHome")}
        </Link>
      </main>

      <SiteFooter />
    </div>
  );
}
