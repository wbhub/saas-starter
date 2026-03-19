"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AuthAwareLinkProps = {
  loggedInHref: string;
  loggedOutHref: string;
  loggedInLabel: string;
  loggedOutLabel: string;
  className: string;
  children?: ReactNode;
};

export function AuthAwareLink({
  loggedInHref,
  loggedOutHref,
  loggedInLabel,
  loggedOutLabel,
  className,
  children,
}: AuthAwareLinkProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setIsLoggedIn(Boolean(data.user));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setIsLoggedIn(Boolean(session?.user));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const href = isLoggedIn ? loggedInHref : loggedOutHref;
  const label = isLoggedIn ? loggedInLabel : loggedOutLabel;

  return (
    <Link href={href} className={className}>
      {label}
      {children}
    </Link>
  );
}
