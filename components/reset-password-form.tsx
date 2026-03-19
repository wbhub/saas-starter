"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
  error?: string;
};

export function ResetPasswordForm({ hasRecoveryProof, recoveryUserId }: ResetPasswordFormProps) {
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

    if (password.length < 8) {
      setMessageType("error");
      setMessage("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessageType("error");
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      if (!(hasRecoveryProof || hasValidRecoveryMarker())) {
        setMessageType("error");
        setMessage("Reset link is invalid or expired. Please request a new link.");
        return;
      }

      const response = await fetch("/reset-password/submit", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ResetPasswordResponse | null;
        throw new Error(payload?.error ?? "Unable to update password. Please try again.");
      }
      clearRecoveryMarker();
      setMessageType("success");
      setMessage("Password updated. Redirecting to login...");
      setTimeout(() => {
        router.push("/login");
      }, 1000);
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Unexpected error");
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
          Verifying your reset link...
        </p>
      </div>
    );
  }

  if (!hasRecoverySession) {
    return (
      <div className="w-full max-w-md rounded-2xl border app-border-subtle app-surface p-8 text-[color:var(--foreground)] shadow-sm">
        <h1 className="text-2xl font-semibold">Reset link is invalid or expired</h1>
        <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
          Request a new password reset email to continue.
        </p>
        <Link
          href="/forgot-password"
          className="mt-5 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border app-border-subtle app-surface p-8 text-[color:var(--foreground)] shadow-sm">
      <h1 className="text-2xl font-semibold">Set a new password</h1>
      <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
        Choose a strong password with at least 8 characters.
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit} aria-busy={loading}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[color:var(--foreground)]">
            New password
          </span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={`${passwordHintId}${message ? ` ${messageId}` : ""}`}
            aria-invalid={messageType === "error" && Boolean(message)}
            className="w-full rounded-lg border app-border-subtle bg-transparent px-3 py-2 text-[color:var(--foreground)] outline-none ring-[color:var(--ring)] placeholder:text-[color:var(--muted-foreground)] focus:ring-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[color:var(--foreground)]">
            Confirm password
          </span>
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
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
          {loading ? "Saving..." : "Update password"}
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
