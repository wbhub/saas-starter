export function resolveActualTokenUsage({
  promptTokens,
  completionTokens,
  projectedRequestTokens,
}: {
  promptTokens: number;
  completionTokens: number;
  projectedRequestTokens: number;
}) {
  const reportedTotal = promptTokens + completionTokens;
  if (reportedTotal > 0) {
    return {
      actualTokens: reportedTotal,
      promptTokens,
      completionTokens,
      usedFallback: false as const,
    };
  }

  return {
    actualTokens: projectedRequestTokens,
    promptTokens: projectedRequestTokens,
    completionTokens: 0,
    usedFallback: true as const,
  };
}
