// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const markdownContentMock = vi.fn(({ content }: { content: string }) => (
  <div data-testid="markdown-content">{content}</div>
));
const toolGroupCardMock = vi.fn((props: unknown) => {
  void props;
  return <div data-testid="tool-group-card">AI Agent</div>;
});
const isToolUIPartMock = vi.fn((part?: { type?: string }) => {
  void part;
  return false;
});

vi.mock("ai", () => ({
  isToolUIPart: (part: { type?: string }) => isToolUIPartMock(part),
  getToolName: () => "",
}));

vi.mock("./markdown-content", () => ({
  MarkdownContent: (props: { content: string }) => markdownContentMock(props),
}));

vi.mock("./reasoning-display", () => ({
  ReasoningDisplay: () => null,
}));

vi.mock("./source-citation", () => ({
  SourceCitation: () => null,
}));

vi.mock("./tool-card", () => ({
  ToolGroupCard: (props: unknown) => toolGroupCardMock(props),
}));

vi.mock("./attachment-preview", () => ({
  AttachmentPreview: () => null,
}));

vi.mock("./message-metadata", () => ({
  MessageMetadata: () => null,
}));

describe("MessageBubble", () => {
  beforeEach(() => {
    markdownContentMock.mockClear();
    toolGroupCardMock.mockClear();
    isToolUIPartMock.mockReset();
  });

  it("consolidates multiple tool parts into a single AI agent dropdown", async () => {
    isToolUIPartMock.mockImplementation((part?: { type?: string }) => part?.type === "tool-mock");

    const { MessageBubble } = await import("./message-bubble");

    render(
      <MessageBubble
        isStreaming={false}
        message={{
          id: "msg_tools",
          role: "assistant",
          parts: [
            { type: "step-start" },
            {
              type: "tool-mock",
              toolCallId: "call_1",
              state: "output-available",
              input: { query: "one" },
              output: { ok: true },
            },
            {
              type: "tool-mock",
              toolCallId: "call_2",
              state: "output-available",
              input: { query: "two" },
              output: { ok: true },
            },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("tool-group-card")).toBeInTheDocument();
    expect(
      screen.getByText("The agent finished its tool work but did not produce a written summary.", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(toolGroupCardMock).toHaveBeenCalledTimes(1);
    expect(toolGroupCardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        calls: expect.arrayContaining([
          expect.objectContaining({ args: { query: "one" } }),
          expect.objectContaining({ args: { query: "two" } }),
        ]),
        stepCount: 1,
      }),
    );
  });

  it("renders assistant markdown while streaming", async () => {
    isToolUIPartMock.mockReturnValue(false);

    const { MessageBubble } = await import("./message-bubble");

    render(
      <MessageBubble
        isStreaming={true}
        message={{
          id: "msg_streaming",
          role: "assistant",
          parts: [{ type: "text", text: "# Heading\n\n- item" }],
        }}
      />,
    );

    expect(screen.getByTestId("markdown-content")).toBeInTheDocument();
    expect(markdownContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: "# Heading\n\n- item" }),
    );
  });

  it("renders assistant markdown once streaming has finished", async () => {
    isToolUIPartMock.mockReturnValue(false);

    const { MessageBubble } = await import("./message-bubble");

    render(
      <MessageBubble
        isStreaming={false}
        message={{
          id: "msg_complete",
          role: "assistant",
          parts: [{ type: "text", text: "# Heading\n\n- item" }],
        }}
      />,
    );

    expect(screen.getByTestId("markdown-content")).toBeInTheDocument();
    expect(markdownContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: "# Heading\n\n- item" }),
    );
  });
});
