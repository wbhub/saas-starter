"use client";

import { memo, useEffect, useRef, useState } from "react";
import { highlight } from "sugar-high";

function CodeBlockInner({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // sugar-high's highlight() returns HTML with <span> color styles — safe since
  // the input is the raw code string, not user-supplied HTML.
  const html = highlight(code);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <div className="group relative mb-2 overflow-hidden rounded-lg border app-border-subtle last:mb-0">
      {language ? (
        <div className="flex items-center justify-between border-b app-border-subtle bg-surface-hover px-3 py-1">
          <span className="font-mono text-xs text-muted-foreground">{language}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : null}
      <pre className="overflow-x-auto bg-surface p-3">
        <code className="font-mono text-xs" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

export const CodeBlock = memo(CodeBlockInner);
