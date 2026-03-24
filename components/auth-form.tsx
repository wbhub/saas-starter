"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useReducer } from "react";
import { useTranslations } from "next-intl";
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

type AuthFormState = {
  email: string;
  password: string;
  loading: boolean;
  socialLoadingProvider: AuthProvider | null;
  message: string | null;
  messageType: "error" | "success";
};

type AuthFormAction =
  | { type: "SET_FIELD"; field: "email" | "password"; value: string }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_SUCCESS"; message?: string }
  | { type: "SUBMIT_ERROR"; message: string }
  | { type: "OAUTH_START"; provider: AuthProvider }
  | { type: "OAUTH_ERROR"; message: string };

const authFormInitialState: AuthFormState = {
  email: "",
  password: "",
  loading: false,
  socialLoadingProvider: null,
  message: null,
  messageType: "success",
};

function authFormReducer(state: AuthFormState, action: AuthFormAction): AuthFormState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "SUBMIT_START":
      return { ...state, loading: true, message: null };
    case "SUBMIT_SUCCESS":
      return {
        ...state,
        loading: false,
        messageType: "success",
        message: action.message ?? null,
      };
    case "SUBMIT_ERROR":
      return { ...state, loading: false, messageType: "error", message: action.message };
    case "OAUTH_START":
      return { ...state, socialLoadingProvider: action.provider, message: null };
    case "OAUTH_ERROR":
      return {
        ...state,
        socialLoadingProvider: null,
        messageType: "error",
        message: action.message,
      };
  }
}

function SocialProviderIcon({ provider }: { provider: AuthProvider }) {
  if (provider === "google") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
        <path
          fill="#4285F4"
          d="M21.805 12.23c0-.68-.061-1.333-.173-1.961H12v3.71h5.502a4.704 4.704 0 0 1-2.04 3.086v2.56h3.296c1.93-1.777 3.047-4.397 3.047-7.395Z"
        />
        <path
          fill="#34A853"
          d="M12 22c2.76 0 5.074-.914 6.766-2.476l-3.296-2.56c-.914.613-2.08.974-3.47.974-2.67 0-4.93-1.803-5.738-4.227H2.853v2.641A10.217 10.217 0 0 0 12 22Z"
        />
        <path
          fill="#FBBC05"
          d="M6.262 13.711A6.143 6.143 0 0 1 5.942 12c0-.594.107-1.17.32-1.711V7.648H2.853A10.217 10.217 0 0 0 1.75 12c0 1.645.394 3.202 1.103 4.352l3.409-2.641Z"
        />
        <path
          fill="#EA4335"
          d="M12 6.062c1.5 0 2.847.516 3.908 1.527l2.934-2.934C17.069 3.01 14.754 2 12 2A10.217 10.217 0 0 0 2.853 7.648l3.409 2.64c.807-2.424 3.068-4.226 5.738-4.226Z"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}

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
  const t = useTranslations("AuthForm");
  const [state, dispatch] = useReducer(authFormReducer, authFormInitialState);
  const { email, password, loading, socialLoadingProvider, message, messageType } = state;
  const isLogin = mode === "login";
  const hasSocialProviders = socialProviders.length > 0;
  const socialProviderOptions = getSocialProviderOptions(socialProviders, lastUsedProvider);
  const messageId = `${mode}-auth-message`;
  const passwordHintId = `${mode}-password-hint`;
  const passwordDescribedBy = [!isLogin ? passwordHintId : "", message ? messageId : ""]
    .filter(Boolean)
    .join(" ");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ type: "SUBMIT_START" });

    try {
      if (isLogin) {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
          body: JSON.stringify({ email, password }),
        });
        const payload = (await response.json().catch(() => null)) as AuthApiResponse | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? t("errors.unableToLogIn"));
        }

        dispatch({ type: "SUBMIT_SUCCESS" });
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
        const payload = (await response.json().catch(() => null)) as AuthApiResponse | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? t("errors.unableToCreateAccount"));
        }

        if (payload?.sessionCreated) {
          dispatch({ type: "SUBMIT_SUCCESS" });
          router.push("/dashboard");
          router.refresh();
          return;
        }
        dispatch({
          type: "SUBMIT_SUCCESS",
          message: payload?.message ?? t("messages.accountCreated"),
        });
      }
    } catch (error) {
      dispatch({
        type: "SUBMIT_ERROR",
        message: error instanceof Error ? error.message : t("errors.unexpected"),
      });
    }
  }

  async function onOAuthClick(provider: AuthProvider) {
    dispatch({ type: "OAUTH_START", provider });

    try {
      const supabase = createClient();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", redirectTo);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: toSupabaseOAuthProvider(provider),
        options: { redirectTo: callbackUrl.toString() },
      });

      if (error) {
        throw new Error(error.message || t("errors.unableSocialLogin"));
      }
    } catch (error) {
      dispatch({
        type: "OAUTH_ERROR",
        message: error instanceof Error ? error.message : t("errors.unexpected"),
      });
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border app-border-subtle app-surface p-8 text-[color:var(--foreground)] shadow-sm">
      <h1 className="text-2xl font-semibold">{isLogin ? t("title.login") : t("title.signup")}</h1>
      <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
        {isLogin ? t("description.login") : t("description.signup")}
      </p>

      {hasSocialProviders ? (
        <div className="mt-6 space-y-3" aria-label={t("socialAuthLabel")}>
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
                <SocialProviderIcon provider={provider} />
                <span>
                  {isProviderLoading ? t("pleaseWait") : t("continueWith", { provider: label })}
                </span>
                {isLastUsed ? (
                  <span className="rounded-full border app-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--muted-foreground)]">
                    {t("lastUsed")}
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
                {t("orContinueWithEmail")}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <form className="mt-6 space-y-4" onSubmit={onSubmit} aria-busy={loading}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[color:var(--foreground)]">
            {t("email")}
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => dispatch({ type: "SET_FIELD", field: "email", value: e.target.value })}
            aria-describedby={message ? messageId : undefined}
            aria-invalid={messageType === "error" && Boolean(message)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-[color:var(--foreground)] outline-none ring-[color:var(--ring)] placeholder:text-[color:var(--muted-foreground)] focus:ring-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[color:var(--foreground)]">
            {t("password")}
          </span>
          <input
            type="password"
            required
            minLength={12}
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={password}
            onChange={(e) =>
              dispatch({ type: "SET_FIELD", field: "password", value: e.target.value })
            }
            aria-describedby={passwordDescribedBy || undefined}
            aria-invalid={messageType === "error" && Boolean(message)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-[color:var(--foreground)] outline-none ring-[color:var(--ring)] placeholder:text-[color:var(--muted-foreground)] focus:ring-2"
          />
        </label>
        {!isLogin ? (
          <p id={passwordHintId} className="text-xs text-[color:var(--muted-foreground)]">
            {t("passwordHint")}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-btn-accent px-4 py-2 font-medium text-white hover:bg-btn-accent-hover disabled:opacity-60"
        >
          {loading ? t("pleaseWait") : isLogin ? t("submit.login") : t("submit.signup")}
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
            {t("needAccount")}{" "}
            <Link
              href="/signup"
              className="font-medium text-[color:var(--accent)] hover:opacity-90"
            >
              {t("signUp")}
            </Link>
          </p>
          <Link
            href="/forgot-password"
            className="font-medium text-[color:var(--accent)] hover:opacity-90"
          >
            {t("forgotPassword")}
          </Link>
        </div>
      ) : (
        <p className="mt-5 text-sm text-[color:var(--muted-foreground)]">
          {t("alreadyHaveAccount")}{" "}
          <Link href="/login" className="font-medium text-[color:var(--accent)] hover:opacity-90">
            {t("logIn")}
          </Link>
        </p>
      )}
    </div>
  );
}
