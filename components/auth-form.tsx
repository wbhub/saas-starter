"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  AuthProvider,
  getSocialProviderOptions,
  toSupabaseOAuthProvider,
} from "@/lib/auth/social-auth";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { createClient } from "@/lib/supabase/client";
import { validatePasswordComplexity } from "@/lib/validation";

type Mode = "login" | "signup";

type AuthApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  sessionCreated?: boolean;
};

export function AuthForm({
  mode,
  redirectTo = "/dashboard",
  socialProviders = [],
  lastUsedProvider = null,
}: {
  mode: Mode;
  redirectTo?: string;
  socialProviders?: AuthProvider[];
  lastUsedProvider?: AuthProvider | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoadingProvider, setSocialLoadingProvider] = useState<AuthProvider | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"error" | "success">("success");
  const isLogin = mode === "login";
  const hasSocialProviders = socialProviders.length > 0;
  const socialProviderOptions = getSocialProviderOptions(
    socialProviders,
    lastUsedProvider,
  );
  const messageId = `${mode}-auth-message`;
  const passwordHintId = `${mode}-password-hint`;
  const passwordDescribedBy = [
    !isLogin ? passwordHintId : "",
    message ? messageId : "",
  ]
    .filter(Boolean)
    .join(" ");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (isLogin) {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
          body: JSON.stringify({ email, password }),
        });
        const payload = (await response.json().catch(() => null)) as
          | AuthApiResponse
          | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to log in.");
        }

        router.push(redirectTo);
        router.refresh();
      } else {
        const passwordValidation = validatePasswordComplexity(password);
        if (!passwordValidation.valid) {
          throw new Error(passwordValidation.error);
        }

        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
          body: JSON.stringify({ email, password }),
        });
        const payload = (await response.json().catch(() => null)) as
          | AuthApiResponse
          | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to create account.");
        }

        if (payload?.sessionCreated) {
          router.push("/dashboard");
          router.refresh();
          return;
        }
        setMessageType("success");
        setMessage(
          payload?.message ??
            "Account created. Check your inbox to verify email if confirmation is enabled.",
        );
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function onOAuthClick(provider: AuthProvider) {
    setSocialLoadingProvider(provider);
    setMessage(null);

    try {
      const supabase = createClient();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", redirectTo);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: toSupabaseOAuthProvider(provider),
        options: { redirectTo: callbackUrl.toString() },
      });

      if (error) {
        throw new Error(error.message || "Unable to continue with social login.");
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Unexpected error");
      setSocialLoadingProvider(null);
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

      {hasSocialProviders ? (
        <div className="mt-6 space-y-3" aria-label="Social authentication">
          {socialProviderOptions.map(({ provider, label, isLastUsed }) => {
            const isProviderLoading = socialLoadingProvider === provider;

            return (
              <button
                key={provider}
                type="button"
                onClick={() => onOAuthClick(provider)}
                disabled={loading || Boolean(socialLoadingProvider)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border app-border-subtle px-4 py-2 text-sm font-medium hover:bg-[color:var(--surface-subtle)] disabled:opacity-60"
              >
                <span>{isProviderLoading ? "Please wait..." : `Continue with ${label}`}</span>
                {isLastUsed ? (
                  <span className="rounded-full border app-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    Last used
                  </span>
                ) : null}
              </button>
            );
          })}
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t app-border-subtle" />
            </div>
            <div className="relative flex justify-center">
              <span className="app-surface px-2 text-xs text-[color:var(--muted-foreground)]">
                or continue with email
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <form className="mt-6 space-y-4" onSubmit={onSubmit} aria-busy={loading}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[color:var(--foreground)]">
            Email
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={message ? messageId : undefined}
            aria-invalid={messageType === "error" && Boolean(message)}
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
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={passwordDescribedBy || undefined}
            aria-invalid={messageType === "error" && Boolean(message)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-[color:var(--foreground)] outline-none ring-[color:var(--ring)] placeholder:text-[color:var(--muted-foreground)] focus:ring-2"
          />
        </label>
        {!isLogin ? (
          <p id={passwordHintId} className="text-xs text-[color:var(--muted-foreground)]">
            Use 8-128 chars with uppercase, lowercase, number, and symbol.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {loading ? "Please wait..." : isLogin ? "Log In" : "Create Account"}
        </button>
      </form>

      {message ? (
        <p
          id={messageId}
          role={messageType === "error" ? "alert" : "status"}
          aria-live={messageType === "error" ? "assertive" : "polite"}
          className="mt-4 rounded-lg app-surface-subtle px-3 py-2 text-sm text-[color:var(--foreground)]"
        >
          {message}
        </p>
      ) : null}

      {isLogin ? (
        <div className="mt-5 flex items-center justify-between gap-3 text-sm">
          <p className="text-[color:var(--muted-foreground)]">
            Need an account?{" "}
            <Link
              href="/signup"
              className="font-medium text-[color:var(--accent)] hover:opacity-90"
            >
              Sign up
            </Link>
          </p>
          <Link
            href="/forgot-password"
            className="font-medium text-[color:var(--accent)] hover:opacity-90"
          >
            Forgot password?
          </Link>
        </div>
      ) : (
        <p className="mt-5 text-sm text-[color:var(--muted-foreground)]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-[color:var(--accent)] hover:opacity-90"
          >
            Log in
          </Link>
        </p>
      )}
    </div>
  );
}
