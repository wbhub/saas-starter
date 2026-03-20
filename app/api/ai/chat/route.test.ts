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

  it("bounds fallback prompt tokens to projected request budget", () => {
    const result = resolveActualTokenUsage({
      promptTokens: 0,
      completionTokens: 0,
      projectedRequestTokens: 300,
      estimatedPromptTokens: 900,
      streamedCompletionChars: 2000,
    });

    expect(result).toEqual({
      actualTokens: 300,
      promptTokens: 300,
      completionTokens: 0,
      usedFallback: true,
    });
  });

  it("never returns negative usage values in fallback mode", () => {
    const result = resolveActualTokenUsage({
      promptTokens: 0,
      completionTokens: 0,
      projectedRequestTokens: -20,
      estimatedPromptTokens: -5,
      streamedCompletionChars: -50,
    });

    expect(result).toEqual({
      actualTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      usedFallback: true,
    });
  });
});
