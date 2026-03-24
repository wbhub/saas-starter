"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "./theme-provider";
import { Monitor, Moon, SunMedium } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Keep server/client initial render stable to avoid hydration mismatches.
  const displayedTheme = mounted ? theme : "system";

  const order: Array<"system" | "light" | "dark"> = ["system", "light", "dark"];
  const index = order.indexOf(displayedTheme);
  const nextTheme = order[(index + 1) % order.length];

  const Icon =
    displayedTheme === "system" ? Monitor : displayedTheme === "light" ? SunMedium : Moon;

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={`Switch theme (current: ${displayedTheme})`}
      aria-pressed={displayedTheme !== "system"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border app-border-subtle app-surface text-[color:var(--foreground)] shadow-sm hover:bg-[color:var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
