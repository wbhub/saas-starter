"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { getCsrfHeaders } from "@/lib/http/csrf";
import { cn } from "@/lib/utils";

type Thread = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

async function fetchWithCsrf(url: string, init?: RequestInit) {
  const headers = {
    ...getCsrfHeaders(),
    ...(init?.headers ?? {}),
  };
  return fetch(url, { ...init, headers });
}

export function ThreadSidebar({
  activeThreadId,
  onSelectThread,
  onNewThread,
  refreshSignal,
}: {
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  refreshSignal?: number;
}) {
  const t = useTranslations("AiThreads");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadThreads = useCallback(async () => {
    setLoadError(false);
    try {
      const response = await fetchWithCsrf("/api/ai/threads");
      if (response.ok) {
        const data = await response.json();
        setThreads(data.threads ?? []);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads, refreshSignal]);

  async function handleDelete(threadId: string) {
    try {
      await fetchWithCsrf(`/api/ai/threads/${threadId}`, { method: "DELETE" });
      setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      if (activeThreadId === threadId) {
        onNewThread();
      }
    } catch {
      // Silently fail
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full shrink-0 flex-col border-b border-border/60 bg-muted/25 lg:w-[260px] lg:border-b-0 lg:border-r dark:bg-muted/15">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-3">
        <h3 className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("title")}
        </h3>
        <button
          type="button"
          onClick={onNewThread}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-lg",
            "text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted/25",
          )}
          title={t("actions.newThread")}
          aria-label={t("actions.newThread")}
        >
          <MessageSquarePlus className="size-4" />
        </button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {isLoading ? (
          <div className="space-y-2 p-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-9 animate-pulse rounded-lg bg-muted/60 dark:bg-muted/40"
                aria-hidden
              />
            ))}
            <p className="sr-only">{t("loading")}</p>
          </div>
        ) : loadError ? (
          <button
            type="button"
            onClick={() => void loadThreads()}
            className="w-full rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-2 py-2 text-left text-xs text-destructive hover:bg-destructive/10"
          >
            {t("loadError")}
          </button>
        ) : threads.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/80 bg-background/50 px-3 py-6 text-center text-xs leading-relaxed text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          threads.map((thread) => {
            const isActive = activeThreadId === thread.id;
            return (
              <div
                key={thread.id}
                className={cn(
                  "group flex items-stretch gap-0.5 rounded-lg transition-colors",
                  isActive
                    ? "bg-background shadow-sm ring-1 ring-border/70"
                    : "hover:bg-background/70",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectThread(thread.id)}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-l-lg px-2.5 py-2 text-left text-sm transition-colors",
                    isActive ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {thread.title ?? t("untitled")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(thread.id)}
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-r-lg px-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive",
                    "group-hover:opacity-100",
                    isActive && "opacity-100",
                  )}
                  title={t("actions.delete")}
                  aria-label={t("actions.delete")}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
