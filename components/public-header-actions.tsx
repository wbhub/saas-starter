"use client";

import Link from "next/link";
import { AuthAwareLink, useIsLoggedIn } from "./auth-aware-link";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { SHOW_LOCALE_SWITCHER } from "@/lib/i18n/config";

type PublicHeaderActionsProps = {
  loginLabel: string;
  signupLabel: string;
  openAppLabel: string;
};

export function PublicHeaderActions({
  loginLabel,
  signupLabel,
  openAppLabel,
}: PublicHeaderActionsProps) {
  const isLoggedIn = useIsLoggedIn();

  return (
    <>
      {SHOW_LOCALE_SWITCHER ? <LocaleSwitcher /> : null}
      <ThemeToggle />
      {!isLoggedIn ? (
        <Link
          href="/login"
          className="rounded-lg border app-border-subtle px-4 py-2 text-sm hover:bg-[color:var(--surface-subtle)]"
        >
          {loginLabel}
        </Link>
      ) : null}
      <AuthAwareLink
        loggedInHref="/dashboard"
        loggedOutHref="/onboarding"
        loggedInLabel={openAppLabel}
        loggedOutLabel={signupLabel}
        className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
      />
    </>
  );
}
