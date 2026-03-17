import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[color:var(--background)] px-4 py-12 text-[color:var(--foreground)]">
      <AuthForm mode="login" />
      <Link
        href="/"
        className="mt-6 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
      >
        Back to home
      </Link>
    </main>
  );
}
