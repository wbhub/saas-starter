export const AI_PROVIDER_NAMES = ["openai", "anthropic", "google"] as const;

export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];

export function isAiProviderName(rawValue: unknown): rawValue is AiProviderName {
  return (
    typeof rawValue === "string" && (AI_PROVIDER_NAMES as readonly string[]).includes(rawValue)
  );
}

export function parseAiProviderName(rawValue: string | undefined): AiProviderName {
  if (!rawValue) {
    return "openai";
  }

  if (isAiProviderName(rawValue)) {
    return rawValue as AiProviderName;
  }

  return "openai";
}

export type ParsedAiModelId = {
  providerName: AiProviderName;
  modelId: string;
  canonicalModelId: string;
  hasExplicitProvider: boolean;
};

export function parseAiModelId(
  rawValue: string | undefined,
  fallbackProvider: AiProviderName = "openai",
): ParsedAiModelId | null {
  const normalizedValue = rawValue?.trim();
  if (!normalizedValue) {
    return null;
  }

  const separatorIndex = normalizedValue.indexOf(":");
  if (separatorIndex > 0) {
    const rawProvider = normalizedValue.slice(0, separatorIndex).trim();
    const rawModelId = normalizedValue.slice(separatorIndex + 1).trim();
    if (isAiProviderName(rawProvider) && rawModelId.length > 0) {
      return {
        providerName: rawProvider,
        modelId: rawModelId,
        canonicalModelId: `${rawProvider}:${rawModelId}`,
        hasExplicitProvider: true,
      };
    }
  }

  return {
    providerName: fallbackProvider,
    modelId: normalizedValue,
    canonicalModelId: `${fallbackProvider}:${normalizedValue}`,
    hasExplicitProvider: false,
  };
}

export function getAiProviderNameForModel(
  rawValue: string | undefined,
  fallbackProvider: AiProviderName = "openai",
) {
  return parseAiModelId(rawValue, fallbackProvider)?.providerName ?? fallbackProvider;
}

export function getCanonicalAiModelId(
  rawValue: string | undefined,
  fallbackProvider: AiProviderName = "openai",
) {
  return parseAiModelId(rawValue, fallbackProvider)?.canonicalModelId ?? null;
}
