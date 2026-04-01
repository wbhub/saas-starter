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
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-4 p-2", className)}
    >
      {children}
    </div>
  );
}
