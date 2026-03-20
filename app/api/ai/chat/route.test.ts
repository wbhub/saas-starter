import { describe, expect, it } from "vitest";
import { resolveActualTokenUsage } from "@/lib/ai/usage";

describe("resolveActualTokenUsage", () => {
  it("uses reported usage when provider includes token counts", () => {
    const result = resolveActualTokenUsage({
      promptTokens: 120,
      completionTokens: 80,
      projectedRequestTokens: 900,
    });

    expect(result).toEqual({
      actualTokens: 200,
      promptTokens: 120,
      completionTokens: 80,
      usedFallback: false,
    });
  });

  it("falls back to projected tokens when usage metadata is missing", () => {
    const result = resolveActualTokenUsage({
      promptTokens: 0,
      completionTokens: 0,
      projectedRequestTokens: 4096,
    });

    expect(result).toEqual({
      actualTokens: 4096,
      promptTokens: 4096,
      completionTokens: 0,
      usedFallback: true,
    });
  });
});
