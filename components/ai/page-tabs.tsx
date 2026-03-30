"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Braces, MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";

export function AiPageTabs({
  chatContent,
  structuredOutputContent,
}: {
  chatContent: ReactNode;
  structuredOutputContent: ReactNode;
}) {
  const t = useTranslations("DashboardAiPage");
  const [activeTab, setActiveTab] = useState<"chat" | "structured">("chat");
  const baseId = useId();
  const chatPanelId = `${baseId}-chat-panel`;
  const structuredPanelId = `${baseId}-structured-panel`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border/80 bg-card text-card-foreground",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-4px_rgba(0,0,0,0.08)]",
        "dark:border-border/60 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_12px_40px_-8px_rgba(0,0,0,0.45)]",
      )}
    >
      <div className="flex flex-col gap-2 border-b border-border/60 bg-muted/35 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div
          className="inline-flex w-full gap-1 rounded-xl bg-background/80 p-1 ring-1 ring-border/60 sm:w-auto dark:bg-background/40"
          role="tablist"
          aria-label={t("tabs.ariaLabel")}
        >
          <button
            type="button"
            role="tab"
            id={`${baseId}-chat`}
            aria-selected={activeTab === "chat"}
            aria-controls={chatPanelId}
            tabIndex={activeTab === "chat" ? 0 : -1}
            onClick={() => setActiveTab("chat")}
            className={cn(
              "inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:flex-initial sm:px-4",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              activeTab === "chat"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/70 dark:bg-muted/80"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <MessageSquare className="size-4 shrink-0 opacity-80" aria-hidden />
            {t("tabs.chat")}
          </button>
          <button
            type="button"
            role="tab"
            id={`${baseId}-structured`}
            aria-selected={activeTab === "structured"}
            aria-controls={structuredPanelId}
            tabIndex={activeTab === "structured" ? 0 : -1}
            onClick={() => setActiveTab("structured")}
            className={cn(
              "inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:flex-initial sm:px-4",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              activeTab === "structured"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/70 dark:bg-muted/80"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <Braces className="size-4 shrink-0 opacity-80" aria-hidden />
            {t("tabs.structuredOutput")}
          </button>
        </div>
        <p className="hidden max-w-[280px] text-right text-xs leading-snug text-muted-foreground sm:block">
          {t("tabs.hint")}
        </p>
      </div>

      <div
        role="tabpanel"
        id={activeTab === "chat" ? chatPanelId : structuredPanelId}
        aria-labelledby={activeTab === "chat" ? `${baseId}-chat` : `${baseId}-structured`}
        className="min-h-0 bg-card"
      >
        {activeTab === "chat" ? chatContent : structuredOutputContent}
      </div>
    </div>
  );
}
