"use client";

import { useEffect, useRef, type ReactNode } from "react";

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
      className={`max-h-[460px] space-y-3 overflow-y-auto rounded-lg app-surface-subtle p-3 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
