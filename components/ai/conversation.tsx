"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Conversation({ children, className }: { children: ReactNode; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isNearBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [children]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 80;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-border/50",
        "bg-gradient-to-b from-muted/40 via-muted/25 to-muted/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        "dark:from-muted/20 dark:via-muted/10 dark:to-muted/5 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        "space-y-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
