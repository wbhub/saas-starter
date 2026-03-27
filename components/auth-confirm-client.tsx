"use client";

import { useEffect, useState } from "react";
import { saveRecoveryMarker } from "@/lib/auth/recovery-marker";
import { getSafeNextPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/client";

function buildCallbackUrl(currentUrl: URL, safeNext: string) {
  const callbackUrl = new URL("/auth/callback", currentUrl.origin);
  currentUrl.searchParams.forEach((value, key) => {
    callbackUrl.searchParams.set(key, key === "next" ? safeNext : value);
  });
  return callbackUrl.toString();
}

function buildLoginErrorUrl(currentUrl: URL, error: "missing_code" | "invalid_code") {
  const loginUrl = new URL("/login", currentUrl.origin);
  loginUrl.searchParams.set("error", error);
  return loginUrl.toString();
}

export function AuthConfirmClient() {
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let active = true;

    async function completeAuth() {
      const currentUrl = new URL(window.location.href);
      const safeNext = getSafeNextPath(currentUrl.searchParams.get("next"));
      const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
      const hasImplicitPayload =
        hashParams.has("access_token") ||
        hashParams.has("refresh_token") ||
        hashParams.has("error_description");

      if (currentUrl.searchParams.has("code")) {
        window.location.replace(buildCallbackUrl(currentUrl, safeNext));
        return;
      }

      if (!hasImplicitPayload) {
        window.location.replace(buildLoginErrorUrl(currentUrl, "missing_code"));
        return;
      }

      const redirectType = hashParams.get("type") ?? currentUrl.searchParams.get("type");
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      if (error || !session) {
        window.location.replace(buildLoginErrorUrl(currentUrl, "invalid_code"));
        return;
      }

      if (redirectType === "recovery" || safeNext.startsWith("/reset-password")) {
        saveRecoveryMarker();
      }

      window.location.replace(new URL(safeNext, currentUrl.origin).toString());
    }

    completeAuth();

    return () => {
      active = false;
    };
  }, [supabase]);

  return (
    <div className="w-full max-w-md rounded-2xl border app-border-subtle app-surface p-8 text-[color:var(--foreground)] shadow-sm">
      <p role="status" aria-live="polite" className="text-sm text-[color:var(--muted-foreground)]">
        Completing authentication...
      </p>
    </div>
  );
}
