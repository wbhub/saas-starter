"use client";

import Cookies from "js-cookie";
import Link from "next/link";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

export const ONBOARDING_COMPLETE_COOKIE = "onboarding_complete";

type AuthAwareLinkProps = {
  loggedInHref: string;
  loggedOutHref: string;
  loggedInLabel: string;
  loggedOutLabel: string;
  /** Href used when the user is logged in but has not completed onboarding. Defaults to loggedOutHref. */
  onboardingHref?: string;
  /** Label used when the user is logged in but has not completed onboarding. Defaults to loggedOutLabel. */
  onboardingLabel?: string;
  className: string;
  children?: ReactNode;
};

let supabaseClient: ReturnType<typeof createClient> | null = null;
let isLoggedInSnapshot = false;
let listenerCount = 0;
let unsubscribeAuthListener: (() => void) | null = null;
const subscribers = new Set<() => void>();

function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient();
  }

  return supabaseClient;
}

function notifySubscribers() {
  for (const subscriber of subscribers) {
    subscriber();
  }
}

async function refreshSnapshot() {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const nextSnapshot = Boolean(data.user);
  if (nextSnapshot !== isLoggedInSnapshot) {
    isLoggedInSnapshot = nextSnapshot;
    notifySubscribers();
  }
}

function ensureAuthListener() {
  if (unsubscribeAuthListener) {
    return;
  }

  const supabase = getSupabaseClient();
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    const nextSnapshot = Boolean(session?.user);
    if (nextSnapshot !== isLoggedInSnapshot) {
      isLoggedInSnapshot = nextSnapshot;
      notifySubscribers();
    }
  });

  unsubscribeAuthListener = () => subscription.unsubscribe();
}

function subscribeAuthState(onStoreChange: () => void) {
  subscribers.add(onStoreChange);
  listenerCount += 1;

  ensureAuthListener();
  void refreshSnapshot();

  return () => {
    subscribers.delete(onStoreChange);
    listenerCount = Math.max(0, listenerCount - 1);
    if (listenerCount === 0 && unsubscribeAuthListener) {
      unsubscribeAuthListener();
      unsubscribeAuthListener = null;
    }
  };
}

function getIsLoggedInSnapshot() {
  return isLoggedInSnapshot;
}

export function useIsLoggedIn() {
  return useSyncExternalStore(subscribeAuthState, getIsLoggedInSnapshot, getIsLoggedInSnapshot);
}

export function useIsOnboarded() {
  const isLoggedIn = useIsLoggedIn();
  if (!isLoggedIn) return false;
  return Cookies.get(ONBOARDING_COMPLETE_COOKIE) === "1";
}

export function AuthAwareLink({
  loggedInHref,
  loggedOutHref,
  loggedInLabel,
  loggedOutLabel,
  onboardingHref,
  onboardingLabel,
  className,
  children,
}: AuthAwareLinkProps) {
  const isLoggedIn = useIsLoggedIn();
  const isOnboarded = useIsOnboarded();

  let href: string;
  let label: string;

  if (!isLoggedIn) {
    href = loggedOutHref;
    label = loggedOutLabel;
  } else if (isOnboarded) {
    href = loggedInHref;
    label = loggedInLabel;
  } else {
    href = onboardingHref ?? loggedOutHref;
    label = onboardingLabel ?? loggedOutLabel;
  }

  return (
    <Link href={href} className={className}>
      {label}
      {children}
    </Link>
  );
}
