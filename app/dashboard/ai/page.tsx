import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { DashboardPageHeader, DashboardPageStack } from "@/components/dashboard-page-header";
import { DashboardPageSection } from "@/components/dashboard-page-section";
import { buttonVariants } from "@/components/ui/button-variants";
import { AiChatCard } from "@/components/ai-chat-card";
import { resolveAiAccess } from "@/lib/ai/access";
import { listThreads } from "@/lib/ai/threads";
import { env } from "@/lib/env";
import { getAiToolsEnabled } from "@/lib/ai/config";
import { AI_TOOL_MAP } from "@/lib/ai/tools";
import { parseAiProviderName } from "@/lib/ai/provider-name";
import { getAvailableModels } from "@/lib/ai/provider";
import { getDashboardShellData } from "@/lib/dashboard/server";
import { cn } from "@/lib/utils";

export default async function DashboardAiPage() {
  const aiProviderName = parseAiProviderName(env.AI_PROVIDER);
  const aiToolsEnabled = getAiToolsEnabled() && Object.keys(AI_TOOL_MAP).length > 0;
  const [t, shellData] = await Promise.all([
    getTranslations("DashboardAiPage"),
    getDashboardShellData(),
  ]);
  const { aiUiGate, displayName, teamContext, user } = shellData;
  const availableModels = getAvailableModels(aiUiGate);
  const defaultModelId =
    resolveAiAccess({ effectivePlanKey: aiUiGate.effectivePlanKey }).model ?? undefined;
  const initialThreads =
    aiUiGate.isVisibleInUi && teamContext
      ? (
          await listThreads({
            teamId: teamContext.teamId,
            userId: user.id,
          })
        ).map(({ id, title, createdAt, updatedAt }) => ({
          id,
          title,
          createdAt,
          updatedAt,
        }))
      : undefined;

  return (
    <>
      <DashboardPageStack
        className={
          aiUiGate.isVisibleInUi
            ? "grid h-full min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-5 sm:gap-6 space-y-0"
            : undefined
        }
      >
        <DashboardPageHeader
          eyebrow={t("header.eyebrow")}
          title={t("header.title")}
          description={t("header.description")}
          descriptionClassName="max-w-3xl"
        />

        {aiUiGate.isVisibleInUi ? (
          <AiChatCard
            providerName={aiProviderName}
            toolsEnabled={aiToolsEnabled}
            userDisplayName={displayName}
            availableModels={availableModels}
            defaultModelId={defaultModelId}
            initialThreads={initialThreads}
          />
        ) : (
          <DashboardPageSection
            icon={Sparkles}
            title={t("unavailable.title")}
            description={t("unavailable.description")}
          >
            <div className="space-y-4">
              <p className="rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                {aiUiGate.reason === "plan_not_allowed"
                  ? t("unavailable.reason.planRequired")
                  : aiUiGate.reason === "ai_not_configured"
                    ? t("unavailable.reason.notConfigured")
                    : aiUiGate.reason === "team_context_missing"
                      ? t("unavailable.reason.teamMissing")
                      : t("unavailable.reason.accessMisconfigured")}
              </p>
              {aiUiGate.reason === "plan_not_allowed" ? (
                <div>
                  <Link
                    href="/dashboard/billing"
                    className={cn(buttonVariants({ variant: "default" }), "inline-flex text-sm")}
                  >
                    {t("unavailable.actions.goToBilling")}
                  </Link>
                </div>
              ) : null}
            </div>
          </DashboardPageSection>
        )}
      </DashboardPageStack>
    </>
  );
}
