"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

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
}: {
  mode: Mode;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"error" | "success">("success");
  const isLogin = mode === "login";
  const messageId = `${mode}-auth-message`;
  const passwordHintId = `${mode}-password-hint`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (isLogin) {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

      <form className="mt-6 space-y-4" onSubmit={onSubmit} aria-busy={loading}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[color:var(--foreground)]">
            Email
          </span>
          <input
            type="email"
            required
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={`${passwordHintId}${message ? ` ${messageId}` : ""}`}
            aria-invalid={messageType === "error" && Boolean(message)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-[color:var(--foreground)] outline-none ring-[color:var(--ring)] placeholder:text-[color:var(--muted-foreground)] focus:ring-2"
          />
        </label>
        <p id={passwordHintId} className="text-xs text-[color:var(--muted-foreground)]">
          Password must be at least 8 characters.
        </p>
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
