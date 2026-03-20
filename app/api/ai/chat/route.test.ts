import { describe, expect, it } from "vitest";
import { resolveActualTokenUsage } from "@/lib/ai/usage";

describe("resolveActualTokenUsage", () => {
  it("uses reported usage when provider includes token counts", () => {
    const result = resolveActualTokenUsage({
      promptTokens: 120,
      completionTokens: 80,
      projectedRequestTokens: 900,
      estimatedPromptTokens: 300,
      streamedCompletionChars: 240,
    });

    expect(result).toEqual({
      actualTokens: 200,
      promptTokens: 120,
      completionTokens: 80,
      usedFallback: false,
    });
  });

  it("falls back to prompt + emitted completion estimate when usage metadata is missing", () => {
    const result = resolveActualTokenUsage({
      promptTokens: 0,
      completionTokens: 0,
      projectedRequestTokens: 4096,
      estimatedPromptTokens: 350,
      streamedCompletionChars: 400,
    });

    expect(result).toEqual({
      actualTokens: 450,
      promptTokens: 350,
      completionTokens: 100,
      usedFallback: true,
    });
  });
});
