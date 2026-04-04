// @vitest-environment jsdom

import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useChatMock = vi.fn();

vi.mock("@ai-sdk/react", () => ({
  useChat: (...args: unknown[]) => useChatMock(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace?: string) => (key: string, values?: Record<string, number | string>) => {
      const dictionaries: Record<string, Record<string, string>> = {
        AiChatCard: {
          placeholder: "Ask anything about your product, docs, or workflow...",
          emptyConversationHeading: "What can I help with?",
          modelAuto: "Auto",
          "actions.send": "Send",
          "actions.stop": "Stop",
          "attachments.label": "Attachments",
          "attachments.selected": `${values?.count ?? 0} selected`,
          "errors.requestFailed": "AI request failed.",
        },
        AiThreads: {
          title: "Threads",
          recents: "Recents",
        },
      };

      return dictionaries[namespace ?? ""]?.[key] ?? key;
    },
}));

vi.mock("@/components/ai/conversation", () => ({
  Conversation: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ai/prompt-input", () => ({
  PromptInput: () => <div>PromptInputMock</div>,
}));

vi.mock("@/components/ai/thread-sidebar", () => ({
  ThreadSidebar: () => <div>ThreadSidebarMock</div>,
}));

vi.mock("@/components/ui/sheet", async () => {
  const ReactModule = await import("react");
  const SheetContext = ReactModule.createContext(false);

  return {
    Sheet: ({
      open,
      children,
    }: {
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
      children: React.ReactNode;
    }) => <SheetContext.Provider value={Boolean(open)}>{children}</SheetContext.Provider>,
    SheetContent: ({ children }: { children: React.ReactNode }) => {
      const open = ReactModule.useContext(SheetContext);
      return open ? <div>{children}</div> : null;
    },
    SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

describe("AiChatCard", () => {
  beforeEach(() => {
    useChatMock.mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: "ready",
      stop: vi.fn(),
      error: null,
      clearError: vi.fn(),
      setMessages: vi.fn(),
    });
  });

  it("opens the mobile recents sheet from the recents button", async () => {
    const { AiChatCard } = await import("./ai-chat-card");

    render(
      <AiChatCard
        providerName="openai"
        toolsEnabled={false}
        userDisplayName="Test User"
        initialThreads={[]}
      />,
    );

    expect(screen.queryByText("Threads")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Recents" }));

    expect(screen.getByText("Threads")).toBeInTheDocument();
  });
});
