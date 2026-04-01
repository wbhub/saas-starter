"use client";

import { useState } from "react";
import { Bot } from "lucide-react";

type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

function ToolStateIndicator({ state }: { state: ToolState }) {
  if (state === "output-available") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        Done
      </span>
    );
  }
  if (state === "output-error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
      Running
    </span>
  );
}

function isSafeHref(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function TavilyResultCard({ result }: { result: unknown }) {
  const data = result as
    | { results?: Array<{ title?: string; url?: string; content?: string }> }
    | undefined;
  if (!data?.results?.length) return <GenericResultCard result={result} />;

  return (
    <div className="mt-2 space-y-1.5">
      {data.results.slice(0, 5).map((item, i) => {
        const href = isSafeHref(item.url) ? item.url : undefined;
        const Tag = href ? "a" : "div";
        return (
          <Tag
            key={i}
            {...(href ? { href, target: "_blank", rel: "noopener noreferrer" } : {})}
            className="block rounded-md border border-border bg-accent p-2 hover:bg-card"
          >
            <p className="text-xs font-medium text-foreground">{item.title}</p>
            {item.content ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.content}</p>
            ) : null}
          </Tag>
        );
      })}
    </div>
  );
}

function FirecrawlResultCard({ result }: { result: unknown }) {
  const data = result as { title?: string; markdown?: string; url?: string } | undefined;
  if (!data?.markdown) return <GenericResultCard result={result} />;

  return (
    <div className="mt-2 space-y-1">
      {data.title ? <p className="text-xs font-medium text-foreground">{data.title}</p> : null}
      <pre className="max-h-[200px] overflow-y-auto rounded-md bg-accent p-2 font-mono text-xs text-muted-foreground">
        {data.markdown.slice(0, 2000)}
        {data.markdown.length > 2000 ? "..." : ""}
      </pre>
    </div>
  );
}

function E2BResultCard({ result }: { result: unknown }) {
  const data = result as
    | {
        text?: string | null;
        stdout?: string[];
        stderr?: string[];
        error?: { name?: string; value?: string; traceback?: string } | null;
        results?: Array<{ text?: string | null; formats?: string[]; hasChart?: boolean }>;
      }
    | undefined;

  if (!data) return <GenericResultCard result={result} />;

  return (
    <div className="mt-2 space-y-2">
      {data.text ? (
        <pre className="max-h-[200px] overflow-y-auto rounded-md bg-accent p-2 font-mono text-xs text-muted-foreground">
          {data.text}
        </pre>
      ) : null}
      {data.stdout?.length ? (
        <div>
          <p className="text-xs font-medium text-foreground">stdout</p>
          <pre className="max-h-[160px] overflow-y-auto rounded-md bg-accent p-2 font-mono text-xs text-muted-foreground">
            {data.stdout.join("\n")}
          </pre>
        </div>
      ) : null}
      {data.stderr?.length ? (
        <div>
          <p className="text-xs font-medium text-destructive">stderr</p>
          <pre className="max-h-[160px] overflow-y-auto rounded-md bg-accent p-2 font-mono text-xs text-muted-foreground">
            {data.stderr.join("\n")}
          </pre>
        </div>
      ) : null}
      {data.results?.length ? (
        <div className="space-y-1">
          {data.results.slice(0, 3).map((item, index) => (
            <div
              key={index}
              className="rounded-md bg-accent p-2 text-xs text-muted-foreground"
            >
              {item.text ? <p className="font-mono">{item.text}</p> : null}
              <p className="mt-1">
                Formats: {item.formats?.join(", ") || "unknown"}
                {item.hasChart ? " • chart" : ""}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {data.error ? (
        <pre className="max-h-[200px] overflow-y-auto rounded-md bg-accent p-2 font-mono text-xs text-destructive">
          {JSON.stringify(data.error, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function GenericResultCard({ result }: { result: unknown }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-md bg-accent p-2 font-mono text-xs">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

const TOOL_RENDERERS: Record<string, React.ComponentType<{ result: unknown }>> = {
  tavilySearch: TavilyResultCard,
  firecrawlScrape: FirecrawlResultCard,
  e2bRunCode: E2BResultCard,
};

export function ToolCard({
  toolName,
  args,
  result,
  state,
}: {
  toolName: string;
  args: unknown;
  result: unknown;
  state: ToolState;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ResultRenderer = TOOL_RENDERERS[toolName] ?? GenericResultCard;

  return (
    <div className="max-w-[88%] rounded-xl border border-primary/20 bg-primary/5 text-sm text-foreground shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
          <Bot className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="font-medium text-primary text-sm truncate">AI Agent</span>
          <span className="inline-block rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary/70 truncate max-w-[120px]">
            {toolName}
          </span>
        </div>
        <ToolStateIndicator state={state} />
        <svg
          className={`h-4 w-4 shrink-0 text-primary/50 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen ? (
        <div className="border-t border-primary/10 bg-background/50 px-4 py-3 space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Input</p>
            <pre className="mt-0.5 overflow-x-auto rounded bg-accent p-2 font-mono text-xs">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
          {result !== undefined ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Output</p>
              <ResultRenderer result={result} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
