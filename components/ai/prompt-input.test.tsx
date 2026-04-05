// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PromptInput } from "./prompt-input";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) => {
    if (key === "attachments.label") return "Attachments";
    if (key === "attachments.selected") return `${values?.count ?? 0} selected`;
    if (key === "actions.send") return "Send";
    if (key === "actions.sending") return "Sending...";
    if (key === "placeholder") return "Ask anything";
    if (key === "errors.maxAttachments") return `Max ${values?.max ?? 0}`;
    return key;
  },
}));

describe("PromptInput", () => {
  it("allows submitting an attachment without typed text", () => {
    const onSubmit = vi.fn();
    render(
      <PromptInput
        onSubmit={onSubmit}
        isSending={false}
        onStop={() => {}}
        providerName="openai"
        validateFiles={() => null}
      />,
    );

    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton).toBeDisabled();

    const fileInput = document.getElementById("ai-chat-attachments-input") as HTMLInputElement;
    const file = new File(["%PDF-1.4"], "spec.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    });

    expect(sendButton).not.toBeDisabled();

    fireEvent.click(sendButton);

    expect(onSubmit).toHaveBeenCalledWith("", [file], undefined);
  });

  it("auto-grows the textarea until the max composer height", () => {
    const onSubmit = vi.fn();
    render(
      <PromptInput
        onSubmit={onSubmit}
        isSending={false}
        onStop={() => {}}
        providerName="openai"
        validateFiles={() => null}
      />,
    );

    const textarea = screen.getByPlaceholderText("Ask anything") as HTMLTextAreaElement;

    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 172,
    });

    fireEvent.change(textarea, {
      target: {
        value: "A longer message",
      },
    });

    expect(textarea.style.height).toBe("172px");
    expect(textarea.style.overflowY).toBe("hidden");
  });

  it("renders the selected model label when controlled by the parent", () => {
    render(
      <PromptInput
        onSubmit={() => {}}
        isSending={false}
        onStop={() => {}}
        providerName="anthropic"
        validateFiles={() => null}
        availableModels={["openai:gpt-5.4", "anthropic:claude-opus-4-6"]}
        selectedModelId="anthropic:claude-opus-4-6"
      />,
    );

    expect(screen.getByText("Claude Opus 4.6")).toBeInTheDocument();
  });
});
