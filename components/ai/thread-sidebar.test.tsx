// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadSidebar } from "./thread-sidebar";

const clientFetch = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const dictionary: Record<string, string> = {
      recents: "Recents",
      loading: "Loading threads...",
      loadError: "Failed to load threads. Tap to retry.",
      empty: "No threads yet.",
      untitled: "Untitled",
      "actions.newThread": "New thread",
      "actions.delete": "Delete thread",
    };
    return dictionary[key] ?? key;
  },
}));

vi.mock("@/lib/http/client-fetch", () => ({
  clientFetch: (...args: unknown[]) => clientFetch(...args),
}));

describe("ThreadSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders server-provided threads without waiting for a client fetch", () => {
    render(
      <ThreadSidebar
        activeThreadId={null}
        onSelectThread={() => {}}
        onNewThread={() => {}}
        initialThreads={[
          {
            id: "thread-1",
            title: "Server loaded thread",
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Server loaded thread" })).toBeInTheDocument();
    expect(clientFetch).not.toHaveBeenCalled();
  });

  it("loads threads on the client when no initial threads were provided", async () => {
    clientFetch.mockResolvedValue({
      json: async () => ({
        threads: [
          {
            id: "thread-2",
            title: "Fetched thread",
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
          },
        ],
      }),
    });

    render(
      <ThreadSidebar activeThreadId={null} onSelectThread={() => {}} onNewThread={() => {}} />,
    );

    await waitFor(() => {
      expect(clientFetch).toHaveBeenCalledWith("/api/ai/threads");
    });
    expect(await screen.findByRole("button", { name: "Fetched thread" })).toBeInTheDocument();
  });

  it("still performs a client fetch when the server-provided list is empty", async () => {
    clientFetch.mockResolvedValue({
      json: async () => ({
        threads: [
          {
            id: "thread-3",
            title: "Recovered thread",
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
          },
        ],
      }),
    });

    render(
      <ThreadSidebar
        activeThreadId={null}
        onSelectThread={() => {}}
        onNewThread={() => {}}
        initialThreads={[]}
      />,
    );

    await waitFor(() => {
      expect(clientFetch).toHaveBeenCalledWith("/api/ai/threads");
    });
    expect(await screen.findByRole("button", { name: "Recovered thread" })).toBeInTheDocument();
  });
});
