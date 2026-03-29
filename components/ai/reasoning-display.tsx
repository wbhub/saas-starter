"use client";

import { useState } from "react";

export function ReasoningDisplay({
  reasoning,
  isStreaming,
}: {
  reasoning: string;
  isStreaming?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-2 rounded-lg border app-border-subtle bg-surface last:mb-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <svg
          className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span>{isStreaming ? "Thinking..." : "Reasoning"}</span>
        {isStreaming ? (
          <span className="ml-auto inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
        ) : null}
      </button>
      {isOpen ? (
        <div className="border-t app-border-subtle px-3 py-2 text-sm text-muted-foreground">
          <pre className="whitespace-pre-wrap font-sans">{reasoning}</pre>
        </div>
      ) : null}
    </div>
  );
}
