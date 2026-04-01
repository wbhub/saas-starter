"use client";

import { type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Braces, MessageSquare } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function AiPageTabs({
  chatContent,
  structuredOutputContent,
}: {
  chatContent: ReactNode;
  structuredOutputContent: ReactNode;
}) {
  const t = useTranslations("DashboardAiPage");

  return (
    <Tabs
      defaultValue="chat"
      className={cn(
        "overflow-hidden rounded-2xl border border-border/80 bg-card text-card-foreground",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-4px_rgba(0,0,0,0.08)]",
        "dark:border-border/60 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_12px_40px_-8px_rgba(0,0,0,0.45)]",
      )}
    >
      <div className="flex flex-col gap-2 border-b border-border/60 bg-muted/35 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <TabsList aria-label={t("tabs.ariaLabel")}>
          <TabsTrigger value="chat">
            <MessageSquare className="size-4 shrink-0 opacity-80" aria-hidden />
            {t("tabs.chat")}
          </TabsTrigger>
          <TabsTrigger value="structured">
            <Braces className="size-4 shrink-0 opacity-80" aria-hidden />
            {t("tabs.structuredOutput")}
          </TabsTrigger>
        </TabsList>
        <p className="hidden max-w-[280px] text-right text-xs leading-snug text-muted-foreground sm:block">
          {t("tabs.hint")}
        </p>
      </div>

      <TabsContent value="chat">{chatContent}</TabsContent>
      <TabsContent value="structured">{structuredOutputContent}</TabsContent>
    </Tabs>
  );
}
