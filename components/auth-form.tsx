"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isLogin = mode === "login";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
          },
        });
        if (error) throw error;
        setMessage(
          "Account created. Check your inbox to verify email if confirmation is enabled.",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border app-border-subtle app-surface p-8 text-[color:var(--foreground)] shadow-sm">
      <h1 className="text-2xl font-semibold">
        {isLogin ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
        {isLogin
          ? "Sign in to manage your SaaS subscription."
          : "Start with secure auth and billing-ready infrastructure."}
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[color:var(--foreground)]">
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-[color:var(--foreground)] outline-none ring-[color:var(--ring)] placeholder:text-[color:var(--muted-foreground)] focus:ring-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[color:var(--foreground)]">
            Password
          </span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-[color:var(--foreground)] outline-none ring-[color:var(--ring)] placeholder:text-[color:var(--muted-foreground)] focus:ring-2"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {loading ? "Please wait..." : isLogin ? "Log In" : "Create Account"}
        </button>
      </form>

      {message ? (
        <p className="mt-4 rounded-lg app-surface-subtle px-3 py-2 text-sm text-[color:var(--foreground)]">
          {message}
        </p>
      ) : null}

      <p className="mt-5 text-sm text-[color:var(--muted-foreground)]">
        {isLogin ? "Need an account?" : "Already have an account?"}{" "}
        <Link
          href={isLogin ? "/signup" : "/login"}
          className="font-medium text-[color:var(--accent)] hover:opacity-90"
        >
          {isLogin ? "Sign up" : "Log in"}
        </Link>
      </p>
    </div>
  );
}
