"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "./theme-provider";
import { Monitor, Moon, SunMedium } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const displayedTheme = mounted ? theme : "system";

  const order: Array<"system" | "light" | "dark"> = ["system", "light", "dark"];
  const index = order.indexOf(displayedTheme);
  const nextTheme = order[(index + 1) % order.length];

  const Icon =
    displayedTheme === "system" ? Monitor : displayedTheme === "light" ? SunMedium : Moon;

  return (
    <Button
      variant="outline"
      size="icon-lg"
      onClick={() => setTheme(nextTheme)}
      aria-label={`Switch theme (current: ${displayedTheme})`}
      aria-pressed={displayedTheme !== "system"}
      className="rounded-full shadow-sm"
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
