"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

export function AiPageTabs({
  chatContent,
  structuredOutputContent,
}: {
  chatContent: ReactNode;
  structuredOutputContent: ReactNode;
}) {
  const t = useTranslations("DashboardAiPage");
  const [activeTab, setActiveTab] = useState<"chat" | "structured">("chat");

  return (
    <div>
      <div className="flex border-b app-border-subtle">
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "chat"
              ? "border-b-2 border-indigo-500 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("tabs.chat")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("structured")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "structured"
              ? "border-b-2 border-indigo-500 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("tabs.structuredOutput")}
        </button>
      </div>
      <div className="mt-4">
        {activeTab === "chat" ? chatContent : structuredOutputContent}
      </div>
    </div>
  );
}
