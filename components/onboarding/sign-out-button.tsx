"use client";

import Cookies from "js-cookie";
import { LogOut } from "lucide-react";
import { logout } from "@/app/dashboard/actions";

export function OnboardingSignOutButton({ label }: { label: string }) {
  const csrfToken = Cookies.get("csrf_token_client") ?? "";

  return (
    <form action={logout}>
      <input type="hidden" name="csrf_token" value={csrfToken} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        <LogOut className="h-3.5 w-3.5" />
        {label}
      </button>
    </form>
  );
}
