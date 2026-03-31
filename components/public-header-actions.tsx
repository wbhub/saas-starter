"use client";

import Link from "next/link";
import { AuthAwareLink, useIsLoggedIn } from "./auth-aware-link";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { buttonVariants } from "@/components/ui/button-variants";
import { SHOW_LOCALE_SWITCHER } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

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
        <>
          <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "text-sm")}>
            {loginLabel}
          </Link>
          <AuthAwareLink
            loggedInHref="/dashboard"
            loggedOutHref="/onboarding"
            loggedInLabel={openAppLabel}
            loggedOutLabel={signupLabel}
            className={cn(buttonVariants({ variant: "default" }), "text-sm")}
          />
        </>
      ) : (
        <AuthAwareLink
          loggedInHref="/dashboard"
          loggedOutHref="/onboarding"
          loggedInLabel={openAppLabel}
          loggedOutLabel={signupLabel}
          className={cn(buttonVariants({ variant: "default" }), "text-sm")}
        />
      )}
    </>
  );
}
