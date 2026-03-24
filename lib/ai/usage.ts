export function resolveActualTokenUsage({
  promptTokens,
  completionTokens,
  projectedRequestTokens,
  estimatedPromptTokens,
  streamedCompletionChars,
}: {
  promptTokens: number;
  completionTokens: number;
  projectedRequestTokens: number;
  estimatedPromptTokens: number;
  streamedCompletionChars: number;
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

  const boundedPromptTokens = Math.max(
    0,
    Math.min(Math.floor(estimatedPromptTokens), Math.floor(projectedRequestTokens)),
  );
  const estimatedCompletionFromOutput = Math.max(0, Math.ceil(streamedCompletionChars / 4));
  const boundedCompletionTokens = Math.max(
    0,
    Math.min(
      estimatedCompletionFromOutput,
      Math.floor(projectedRequestTokens) - boundedPromptTokens,
    ),
  );
  const fallbackActual = boundedPromptTokens + boundedCompletionTokens;

  return {
    actualTokens: fallbackActual,
    promptTokens: boundedPromptTokens,
    completionTokens: boundedCompletionTokens,
    usedFallback: true as const,
  };
}
