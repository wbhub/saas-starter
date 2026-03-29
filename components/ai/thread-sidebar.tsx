"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getCsrfHeaders } from "@/lib/http/csrf";

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

  const loadThreads = useCallback(async () => {
    try {
      const response = await fetchWithCsrf("/api/ai/threads");
      if (response.ok) {
        const data = await response.json();
        setThreads(data.threads ?? []);
      }
    } catch {
      // Silently fail — threads are optional
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
    <div className="flex h-full w-56 shrink-0 flex-col border-r app-border-subtle bg-surface">
      <div className="flex items-center justify-between border-b app-border-subtle p-3">
        <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
        <button
          type="button"
          onClick={onNewThread}
          className="rounded-md p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          title={t("actions.newThread")}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {isLoading ? (
          <p className="p-2 text-xs text-muted-foreground">{t("loading")}</p>
        ) : threads.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">{t("empty")}</p>
        ) : (
          threads.map((thread) => (
            <div
              key={thread.id}
              className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
                activeThreadId === thread.id
                  ? "bg-surface-hover text-foreground"
                  : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectThread(thread.id)}
                className="min-w-0 flex-1 truncate text-left"
              >
                {thread.title ?? t("untitled")}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(thread.id)}
                className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-red-500 group-hover:block"
                title={t("actions.delete")}
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
