import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/auth-form";
import { PublicCenteredContent, PublicShell } from "@/components/layout-shells";
import {
  getEnabledSocialAuthProviders,
  LAST_AUTH_PROVIDER_COOKIE,
  parseAuthProvider,
} from "@/lib/auth/social-auth";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";

type SignupPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function buildOnboardingRedirect(params: Record<string, string | string[] | undefined>): string {
  const plan = Array.isArray(params.plan) ? params.plan[0] : params.plan;
  const interval = Array.isArray(params.interval) ? params.interval[0] : params.interval;

  if (!plan) return "/onboarding";

  const url = new URL("/onboarding", "http://localhost");
  url.searchParams.set("plan", plan);
  if (interval) url.searchParams.set("interval", interval);
  return `${url.pathname}${url.search}`;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
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

  const resolvedSearchParams = (await searchParams) ?? {};
  const plan = Array.isArray(resolvedSearchParams.plan)
    ? resolvedSearchParams.plan[0]
    : resolvedSearchParams.plan;

  if (!plan) {
    redirect("/onboarding");
  }

  const redirectTo = buildOnboardingRedirect(resolvedSearchParams);

  return (
    <div className="app-content flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <PublicShell as="main" className="flex flex-1 flex-col py-12">
        <PublicCenteredContent>
          <AuthForm
            mode="signup"
            redirectTo={redirectTo}
            socialProviders={socialProviders}
            lastUsedProvider={lastUsedProvider}
          />
          <Link href="/" className="mt-6 text-sm text-muted-foreground hover:text-foreground">
            {t("backHome")}
          </Link>
        </PublicCenteredContent>
      </PublicShell>

      <SiteFooter />
    </div>
  );
}
