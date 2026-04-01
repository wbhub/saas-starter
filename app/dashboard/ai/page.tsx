import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { AiChatCard } from "@/components/ai-chat-card";
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
  const t = await getTranslations("DashboardAiPage");
  const { aiUiGate, displayName } = await getDashboardShellData();
  const availableModels = getAvailableModels(aiUiGate);

  return (
    <>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("header.eyebrow")}
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">{t("header.title")}</h1>
        <p className="mt-2 text-base text-muted-foreground">{t("header.description")}</p>
      </div>

      {aiUiGate.isVisibleInUi ? (
        <AiChatCard
          providerName={aiProviderName}
          toolsEnabled={aiToolsEnabled}
          userDisplayName={displayName}
          availableModels={availableModels}
        />
      ) : (
        <section className="rounded-xl bg-card ring-1 ring-border p-6">
          <h2 className="text-lg font-semibold text-foreground">{t("unavailable.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("unavailable.description")}</p>
          <p className="mt-3 rounded-lg app-surface-subtle px-3 py-2 text-sm text-muted-foreground">
            {aiUiGate.reason === "plan_not_allowed"
              ? t("unavailable.reason.planRequired")
              : aiUiGate.reason === "ai_not_configured"
                ? t("unavailable.reason.notConfigured")
                : aiUiGate.reason === "team_context_missing"
                  ? t("unavailable.reason.teamMissing")
                  : t("unavailable.reason.accessMisconfigured")}
          </p>
          {aiUiGate.reason === "plan_not_allowed" ? (
            <div className="mt-4">
              <Link
                href="/dashboard/billing"
                className={cn(buttonVariants({ variant: "default" }), "inline-flex text-sm")}
              >
                {t("unavailable.actions.goToBilling")}
              </Link>
            </div>
          ) : null}
        </section>
      )}
    </>
  );
}
