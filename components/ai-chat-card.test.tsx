// @vitest-environment jsdom

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
          "actions.newThread": "New thread",
          "actions.showRecents": "Show recents",
          "actions.hideRecents": "Hide recents",
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
  ThreadSidebar: ({ headerLeading }: { headerLeading?: React.ReactNode }) => (
    <div>
      {headerLeading}
      ThreadSidebarMock
    </div>
  ),
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
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1440,
    });
    window.localStorage.clear();
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

  it("auto-collapses recents on narrower desktop widths and lets you reopen them", async () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1200,
    });

    const { AiChatCard } = await import("./ai-chat-card");

    render(
      <AiChatCard
        providerName="openai"
        toolsEnabled={false}
        userDisplayName="Test User"
        initialThreads={[]}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("ThreadSidebarMock")).not.toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "New thread" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show recents" }));

    expect(screen.getByText("ThreadSidebarMock")).toBeInTheDocument();
  });

  it("persists the desktop recents toggle choice across remounts", async () => {
    const { AiChatCard } = await import("./ai-chat-card");

    const { unmount } = render(
      <AiChatCard
        providerName="openai"
        toolsEnabled={false}
        userDisplayName="Test User"
        initialThreads={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide recents" }));

    await waitFor(() => {
      expect(screen.queryByText("ThreadSidebarMock")).not.toBeInTheDocument();
    });

    unmount();

    render(
      <AiChatCard
        providerName="openai"
        toolsEnabled={false}
        userDisplayName="Test User"
        initialThreads={[]}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("ThreadSidebarMock")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "New thread" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show recents" })).toBeInTheDocument();
  });
});
