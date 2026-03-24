import { describe, expect, it } from "vitest";
import { estimateImagePromptTokens, estimatePromptTokens } from "./token-estimation";

describe("estimatePromptTokens", () => {
  it("estimates text-only messages with a stable char-to-token ratio", () => {
    const messages = [{ content: "hello world" }, { content: "How are you doing today?" }];

    const totalChars = "hello world".length + "How are you doing today?".length;
    const expected = Math.ceil(totalChars / 3) + messages.length * 8;

    expect(estimatePromptTokens(messages)).toBe(expected);
  });

  it("adds image token estimates for image attachments", () => {
    const textOnly = estimatePromptTokens([{ content: "describe this image" }]);
    const withImage = estimatePromptTokens([
      {
        content: "describe this image",
        attachments: [
          {
            type: "image",
            data: "data:image/png;base64,QUJDREVGR0g=",
          },
        ],
      },
    ]);

    expect(withImage).toBeGreaterThan(textOnly);
    expect(withImage - textOnly).toBe(400);
  });

  it("adds file-size estimates for file attachments", () => {
    const base = estimatePromptTokens([{ content: "summarize attached file" }]);
    const dataAttachment = estimatePromptTokens([
      {
        content: "summarize attached file",
        attachments: [{ type: "file", data: "a".repeat(300) }],
      },
    ]);
    const urlAttachment = estimatePromptTokens([
      {
        content: "summarize attached file",
        attachments: [{ type: "file" }],
      },
    ]);

    expect(dataAttachment - base).toBe(Math.ceil(300 / 3));
    expect(urlAttachment - base).toBe(600);
  });
});

describe("estimateImagePromptTokens", () => {
  it("uses higher estimate for fileId references than URL references", () => {
    expect(estimateImagePromptTokens({ type: "image", fileId: "file_123" })).toBe(1_000);
    expect(estimateImagePromptTokens({ type: "image" })).toBe(900);
  });
});
