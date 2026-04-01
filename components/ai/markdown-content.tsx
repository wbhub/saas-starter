"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";

function MarkdownContentInner({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className ?? "");
          const code = String(children).replace(/\n$/, "");
          if (match) {
            return <CodeBlock code={code} language={match[1]} />;
          }
          return (
            <code className="rounded bg-accent px-1 py-0.5 font-mono text-[0.85em]" {...props}>
              {children}
            </code>
          );
        },
        pre({ children }) {
          return <>{children}</>;
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>;
        },
        ul({ children }) {
          return <ul className="mb-2 ml-4 list-disc last:mb-0">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="mb-2 ml-4 list-decimal last:mb-0">{children}</ol>;
        },
        li({ children }) {
          return <li className="mb-0.5">{children}</li>;
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-primary/80"
            >
              {children}
            </a>
          );
        },
        blockquote({ children }) {
          return (
            <blockquote className="mb-2 border-l-2 border-border pl-3 italic text-muted-foreground last:mb-0">
              {children}
            </blockquote>
          );
        },
        table({ children }) {
          return (
            <div className="mb-2 overflow-x-auto last:mb-0">
              <table className="min-w-full border-collapse text-sm">{children}</table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th className="border border-border bg-accent px-2 py-1 text-left font-medium">
              {children}
            </th>
          );
        },
        td({ children }) {
          return <td className="border border-border px-2 py-1">{children}</td>;
        },
        h1({ children }) {
          return <h1 className="mb-2 text-lg font-bold">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="mb-2 text-base font-bold">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="mb-1.5 text-sm font-bold">{children}</h3>;
        },
        hr() {
          return <hr className="my-3 border-border" />;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export const MarkdownContent = memo(MarkdownContentInner);
