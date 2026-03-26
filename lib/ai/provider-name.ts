export const AI_PROVIDER_NAMES = ["openai", "anthropic", "google"] as const;

export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];

export function parseAiProviderName(rawValue: string | undefined): AiProviderName {
  if (!rawValue) {
    return "openai";
  }

  if ((AI_PROVIDER_NAMES as readonly string[]).includes(rawValue)) {
    return rawValue as AiProviderName;
  }

  return "openai";
}
