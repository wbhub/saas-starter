"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { createClient } from "@/lib/supabase/client";
import { validatePasswordComplexity } from "@/lib/validation";

const RECOVERY_MARKER_KEY = "saas-starter-password-recovery";
const RECOVERY_MARKER_MAX_AGE_MS = 15 * 60 * 1000;

function saveRecoveryMarker() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    RECOVERY_MARKER_KEY,
    JSON.stringify({ issuedAt: Date.now() }),
  );
}

function clearRecoveryMarker() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(RECOVERY_MARKER_KEY);
}

function hasValidRecoveryMarker() {
  if (typeof window === "undefined") {
    return false;
  }

  const raw = window.sessionStorage.getItem(RECOVERY_MARKER_KEY);
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw) as { issuedAt?: unknown };
    if (typeof parsed.issuedAt !== "number") {
      return false;
    }
    return Date.now() - parsed.issuedAt <= RECOVERY_MARKER_MAX_AGE_MS;
  } catch {
    return false;
  }
}

type ResetPasswordFormProps = {
  hasRecoveryProof: boolean;
  recoveryUserId: string;
};

type ResetPasswordResponse = {
  ok?: boolean;
  error?: string;
};

export function ResetPasswordForm({ hasRecoveryProof, recoveryUserId }: ResetPasswordFormProps) {
  const t = useTranslations("ResetPasswordForm");
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"error" | "success">("success");
  const messageId = "reset-password-message";
  const passwordHintId = "reset-password-hint";

  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        saveRecoveryMarker();
        if (active) {
          setHasRecoverySession(true);
        }
      }
    });

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const hasRecoverySessionProof = hasRecoveryProof || hasValidRecoveryMarker();
      const isRecoveredUser = session?.user.id === recoveryUserId;
      setHasRecoverySession(Boolean(session) && hasRecoverySessionProof && isRecoveredUser);
      setCheckingSession(false);
    }

    checkSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [hasRecoveryProof, recoveryUserId, supabase]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const passwordValidation = validatePasswordComplexity(password);
    if (!passwordValidation.valid) {
      setMessageType("error");
      setMessage(passwordValidation.error);
      return;
    }

    if (password !== confirmPassword) {
      setMessageType("error");
      setMessage(t("errors.passwordsDoNotMatch"));
      return;
    }

    setLoading(true);

    try {
      if (!(hasRecoveryProof || hasValidRecoveryMarker())) {
        setMessageType("error");
        setMessage(t("errors.invalidOrExpired"));
        return;
      }

      const response = await fetch("/reset-password/submit", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ResetPasswordResponse | null;
        throw new Error(payload?.error ?? t("errors.unableToUpdatePassword"));
      }
      clearRecoveryMarker();
      setMessageType("success");
      setMessage(t("messages.passwordUpdated"));
      setTimeout(() => {
        router.push("/login");
      }, 1000);
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : t("errors.unexpected"));
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="w-full max-w-md rounded-2xl border app-border-subtle app-surface p-8 text-[color:var(--foreground)] shadow-sm">
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-[color:var(--muted-foreground)]"
        >
          {t("checking")}
        </p>
      </div>
    );
  }

  if (!hasRecoverySession) {
    return (
      <div className="w-full max-w-md rounded-2xl border app-border-subtle app-surface p-8 text-[color:var(--foreground)] shadow-sm">
        <h1 className="text-2xl font-semibold">{t("invalidTitle")}</h1>
        <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
          {t("invalidDescription")}
        </p>
        <Link
          href="/forgot-password"
          className="mt-5 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          {t("requestNewLink")}
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border app-border-subtle app-surface p-8 text-[color:var(--foreground)] shadow-sm">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
        {t("description")}
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit} aria-busy={loading}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[color:var(--foreground)]">
            {t("newPassword")}
          </span>
          <input
            type="password"
            required
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={`${passwordHintId}${message ? ` ${messageId}` : ""}`}
            aria-invalid={messageType === "error" && Boolean(message)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-[color:var(--foreground)] outline-none ring-[color:var(--ring)] placeholder:text-[color:var(--muted-foreground)] focus:ring-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[color:var(--foreground)]">
            {t("confirmPassword")}
          </span>
          <input
            type="password"
            required
            minLength={12}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-describedby={`${passwordHintId}${message ? ` ${messageId}` : ""}`}
            aria-invalid={messageType === "error" && Boolean(message)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-[color:var(--foreground)] outline-none ring-[color:var(--ring)] placeholder:text-[color:var(--muted-foreground)] focus:ring-2"
          />
        </label>
        <p id={passwordHintId} className="text-xs text-[color:var(--muted-foreground)]">
          {t("passwordHint")}
        </p>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {loading ? t("saving") : t("updatePassword")}
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
    </div>
  );
}
