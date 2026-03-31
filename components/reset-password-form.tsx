"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  clearRecoveryMarker,
  hasValidRecoveryMarker,
  saveRecoveryMarker,
} from "@/lib/auth/recovery-marker";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { createClient } from "@/lib/supabase/client";
import { validatePasswordComplexity } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const hasServerRecoveryProof = hasRecoveryProof && Boolean(recoveryUserId);

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
      const isRecoveredUser = recoveryUserId
        ? session?.user.id === recoveryUserId
        : Boolean(session);
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
      const hasClientRecoveryProof = hasValidRecoveryMarker();
      if (!(hasRecoveryProof || hasClientRecoveryProof)) {
        setMessageType("error");
        setMessage(t("errors.invalidOrExpired"));
        return;
      }

      if (hasServerRecoveryProof) {
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
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          throw new Error(error.message || t("errors.unableToUpdatePassword"));
        }
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
      <div className="w-full max-w-md rounded-2xl border app-border-subtle app-surface p-8 text-foreground shadow-sm">
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {t("checking")}
        </p>
      </div>
    );
  }

  if (!hasRecoverySession) {
    return (
      <div className="w-full max-w-md rounded-2xl border app-border-subtle app-surface p-8 text-foreground shadow-sm">
        <h1 className="text-2xl font-semibold">{t("invalidTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("invalidDescription")}</p>
        <Button
          render={<Link href="/forgot-password" />}
          variant="default"
          size="control"
          className="mt-5"
        >
          {t("requestNewLink")}
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border app-border-subtle app-surface p-8 text-foreground shadow-sm">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit} aria-busy={loading}>
        <div>
          <Label htmlFor="reset-new-password" className="mb-1">
            {t("newPassword")}
          </Label>
          <Input
            id="reset-new-password"
            type="password"
            required
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={`${passwordHintId}${message ? ` ${messageId}` : ""}`}
            aria-invalid={messageType === "error" && Boolean(message)}
          />
        </div>
        <div>
          <Label htmlFor="reset-confirm-password" className="mb-1">
            {t("confirmPassword")}
          </Label>
          <Input
            id="reset-confirm-password"
            type="password"
            required
            minLength={12}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-describedby={`${passwordHintId}${message ? ` ${messageId}` : ""}`}
            aria-invalid={messageType === "error" && Boolean(message)}
          />
        </div>
        <p id={passwordHintId} className="text-xs text-muted-foreground">
          {t("passwordHint")}
        </p>
        <Button
          type="submit"
          variant="default"
          size="control"
          disabled={loading}
          className="w-full hover:bg-primary/80"
        >
          {loading ? t("saving") : t("updatePassword")}
        </Button>
      </form>

      {message ? (
        <p
          id={messageId}
          role={messageType === "error" ? "alert" : "status"}
          aria-live={messageType === "error" ? "assertive" : "polite"}
          className="mt-4 rounded-lg app-surface-subtle px-3 py-2 text-sm text-foreground"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
