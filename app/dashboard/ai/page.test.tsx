import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const listThreads = vi.fn();
const aiChatCard = vi.fn(({ initialThreads }: { initialThreads?: Array<{ id: string }> }) => (
  <div>AiChatCardMock:{initialThreads?.length ?? 0}</div>
));

function mockAiPageDependencies({
  isVisibleInUi,
  reason,
}: {
  isVisibleInUi: boolean;
  reason: "enabled" | "plan_not_allowed" | "ai_not_configured";
}) {
  vi.doMock("next-intl/server", () => ({
    getTranslations: vi.fn().mockResolvedValue((key: string) => {
      const dictionary: Record<string, string> = {
        "header.eyebrow": "AI",
        "header.title": "AI Chat & Agents",
        "header.description":
          "Chat with your configured model using your team billing and usage limits.",
        "unavailable.title": "AI chat is unavailable",
        "unavailable.description": "This workspace cannot use AI chat right now.",
        "unavailable.reason.planRequired": "AI access requires an eligible paid plan.",
        "unavailable.reason.notConfigured": "AI is not configured for this app yet.",
        "unavailable.reason.teamMissing": "AI requires an active team workspace.",
        "unavailable.reason.accessMisconfigured": "AI access settings are currently misconfigured.",
        "unavailable.actions.goToBilling": "Go to billing",
      };
      return dictionary[key] ?? key;
    }),
  }));
  vi.doMock("next/link", () => ({
    default: ({
      href,
      children,
      className,
    }: {
      href: string;
      children: ReactNode;
      className?: string;
    }) => (
      <a href={href} className={className}>
        {children}
      </a>
    ),
  }));
  vi.doMock("@/lib/dashboard/server", () => ({
    getDashboardShellData: vi.fn().mockResolvedValue({
      aiUiGate: {
        isVisibleInUi,
        reason,
        effectivePlanKey: "free",
        accessMode: "paid",
      },
      displayName: "Test User",
      user: { id: "user-123" },
      teamContext: isVisibleInUi ? { teamId: "team-123", teamName: "Team", role: "owner" } : null,
    }),
  }));
  vi.doMock("@/lib/ai/threads", () => ({
    listThreads,
  }));
  vi.doMock("@/components/ai-chat-card", () => ({
    AiChatCard: aiChatCard,
  }));
}

describe("Dashboard AI page UI gating", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    listThreads.mockResolvedValue([
      {
        id: "thread-1",
        title: "Recent thread",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      },
    ]);
  });

  it("renders unavailable state and billing CTA when plan-gated", async () => {
    mockAiPageDependencies({ isVisibleInUi: false, reason: "plan_not_allowed" });

    const DashboardAiPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await DashboardAiPage());

    expect(html).toContain("AI Chat &amp; Agents");
    expect(html).toContain("AI chat is unavailable");
    expect(html).toContain("AI access requires an eligible paid plan.");
    expect(html).toContain('href="/dashboard/billing"');
    expect(html).not.toContain("AiChatCardMock");
    expect(listThreads).not.toHaveBeenCalled();
  });

  it("loads initial threads on the server when AI is visible", async () => {
    mockAiPageDependencies({ isVisibleInUi: true, reason: "enabled" });

    const DashboardAiPage = (await import("./page")).default;
    const html = renderToStaticMarkup(await DashboardAiPage());

    expect(html).toContain("AI Chat &amp; Agents");
    expect(html).toContain("AiChatCardMock:1");
    expect(html).not.toContain("AI chat is unavailable");
    expect(listThreads).toHaveBeenCalledWith({
      teamId: "team-123",
      userId: "user-123",
    });
  });
});
