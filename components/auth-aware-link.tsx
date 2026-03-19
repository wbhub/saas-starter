"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

type AuthAwareLinkProps = {
  loggedInHref: string;
  loggedOutHref: string;
  loggedInLabel: string;
  loggedOutLabel: string;
  className: string;
  children?: ReactNode;
};

const supabase = createClient();
let isLoggedInSnapshot = false;
let listenerCount = 0;
let unsubscribeAuthListener: (() => void) | null = null;
const subscribers = new Set<() => void>();

function notifySubscribers() {
  for (const subscriber of subscribers) {
    subscriber();
  }
}

async function refreshSnapshot() {
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

export function AuthAwareLink({
  loggedInHref,
  loggedOutHref,
  loggedInLabel,
  loggedOutLabel,
  className,
  children,
}: AuthAwareLinkProps) {
  const isLoggedIn = useSyncExternalStore(
    subscribeAuthState,
    getIsLoggedInSnapshot,
    getIsLoggedInSnapshot,
  );

  const href = isLoggedIn ? loggedInHref : loggedOutHref;
  const label = isLoggedIn ? loggedInLabel : loggedOutLabel;

  return (
    <Link href={href} className={className}>
      {label}
      {children}
    </Link>
  );
}
