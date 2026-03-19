import Link from "next/link";
import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";

function getSafeNextPath(nextValue: string | string[] | undefined) {
  const next = Array.isArray(nextValue) ? nextValue[0] : nextValue;
  if (!next) {
    return "/dashboard";
  }

  if (/[\u0000-\u001F\u007F]/.test(next) || next.includes("\\")) {
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
  const supabase = await createClient();
  const params = await searchParams;
  const safeNext = getSafeNextPath(params.next);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(safeNext);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--background)] text-[color:var(--foreground)]">
      <header className="border-b app-border-subtle">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-400 text-white shadow-sm shadow-indigo-500/30">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-semibold leading-tight tracking-tight">
                SaaS Starter
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="rounded-lg border app-border-subtle px-4 py-2 text-sm hover:bg-[color:var(--surface-subtle)]"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Start Free
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <AuthForm mode="login" redirectTo={safeNext} />
        <Link
          href="/"
          className="mt-6 text-sm text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
        >
          Back to home
        </Link>
      </main>

      <SiteFooter />
    </div>
  );
}
