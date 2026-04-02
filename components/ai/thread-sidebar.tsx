"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { clientFetch } from "@/lib/http/client-fetch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Thread = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

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
      const response = await clientFetch("/api/ai/threads");
      const data = await response.json();
      setThreads(data.threads ?? []);
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
      await clientFetch(`/api/ai/threads/${threadId}`, { method: "DELETE" });
      setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      if (activeThreadId === threadId) {
        onNewThread();
      }
    } catch {
      // Optimistic delete: remove from list even if the request failed.
      // The thread will reappear on next load if it wasn't actually deleted.
      setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
      if (activeThreadId === threadId) {
        onNewThread();
      }
    }
  }

  return (
    <div
      className={cn("flex min-h-0 w-full shrink-0 flex-col", "pb-3 lg:w-[260px] lg:self-stretch")}
    >
      <div className="flex items-center justify-between gap-2 px-5 py-3 mt-2">
        <h3 className={cn("truncate text-sm font-normal", "text-muted-foreground")}>
          {t("recents")}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onNewThread}
          className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={t("actions.newThread")}
          aria-label={t("actions.newThread")}
        >
          <svg
            className="size-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </Button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto scroll-pb-4 px-3 pb-5">
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
          <Button
            type="button"
            variant="destructive"
            onClick={() => void loadThreads()}
            className={cn(
              "w-full justify-start rounded-lg border border-dashed border-destructive/40 bg-destructive/5",
              "px-2 py-2 text-left text-xs text-destructive hover:bg-destructive/10",
            )}
          >
            {t("loadError")}
          </Button>
        ) : threads.length === 0 ? (
          <p
            className={cn(
              "rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-6",
              "text-center text-xs leading-relaxed text-muted-foreground",
            )}
          >
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
                  isActive ? "bg-muted/40" : "hover:bg-muted/20",
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onSelectThread(thread.id)}
                  className={cn(
                    "min-w-0 flex-1 justify-start truncate rounded-l-lg rounded-r-none px-2.5 py-2 text-left",
                    "text-sm font-normal leading-relaxed",
                    "transition-colors hover:bg-transparent",
                    isActive
                      ? "text-foreground hover:text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {thread.title ?? t("untitled")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleDelete(thread.id)}
                  className={cn(
                    "h-auto w-8 shrink-0 rounded-l-none rounded-r-lg px-1.5",
                    "text-muted-foreground opacity-0 transition-opacity hover:bg-transparent hover:text-destructive",
                    "group-hover:opacity-100",
                    isActive && "opacity-100",
                  )}
                  title={t("actions.delete")}
                  aria-label={t("actions.delete")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
