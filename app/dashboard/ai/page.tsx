import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AiChatCard } from "@/components/ai-chat-card";
import { AiObjectCard } from "@/components/ai-object-card";
import { AiPageTabs } from "@/components/ai/page-tabs";
import { env } from "@/lib/env";
import { parseAiProviderName } from "@/lib/ai/provider-name";
import { getDashboardShellData } from "@/lib/dashboard/server";

export default async function DashboardAiPage() {
  const aiProviderName = parseAiProviderName(env.AI_PROVIDER);
  const aiToolsEnabled = env.NEXT_PUBLIC_AI_TOOLS_ENABLED === "true";
  const t = await getTranslations("DashboardAiPage");
  const { aiUiGate } = await getDashboardShellData();

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
        <AiPageTabs
          chatContent={
            <AiChatCard providerName={aiProviderName} toolsEnabled={aiToolsEnabled} />
          }
          structuredOutputContent={<AiObjectCard />}
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
                className="inline-flex rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
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
