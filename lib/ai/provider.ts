import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { type AiModality } from "@/lib/ai/config";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const AI_PROVIDERS = ["openai", "anthropic", "google"] as const;
type AiProvider = (typeof AI_PROVIDERS)[number];
const KNOWN_TEXT_ONLY_MODEL_PREFIXES = ["gpt-3.5"] as const;
const ALL_MODALITIES = ["text", "image", "file"] as const satisfies readonly AiModality[];

type ModelModalityMapEntry = {
  key: string;
  modalities: readonly AiModality[];
};

const DEFAULT_MODEL_MODALITIES_BY_PROVIDER: Record<AiProvider, readonly ModelModalityMapEntry[]> = {
  openai: [
    { key: "gpt-3.5*", modalities: ["text"] },
    { key: "gpt-4.1*", modalities: ["text", "image", "file"] },
    { key: "gpt-4o*", modalities: ["text", "image", "file"] },
    { key: "gpt-5*", modalities: ["text", "image", "file"] },
  ],
  anthropic: [{ key: "claude*", modalities: ["text", "image", "file"] }],
  google: [{ key: "gemini*", modalities: ["text", "image", "file"] }],
};

function parseModalities(raw: unknown): readonly AiModality[] | null {
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",").map((value) => value.trim())
      : [];
  const parsed = values.filter(
    (value): value is AiModality =>
      typeof value === "string" && ALL_MODALITIES.includes(value as AiModality),
  );
  const unique = Array.from(new Set(parsed));
  if (!unique.length) {
    return null;
  }
  if (!unique.includes("text")) {
    unique.unshift("text");
  }
  return unique;
}

function parseModelModalityMap(rawValue: string | undefined): ModelModalityMapEntry[] {
  if (!rawValue) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch (error) {
    logger.warn("Invalid AI_MODEL_MODALITIES_MAP_JSON; ignoring custom model capability map.", {
      envKey: "AI_MODEL_MODALITIES_MAP_JSON",
      fallbackBehavior: "defaults_only",
      error,
    });
    return [];
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    logger.warn("Invalid AI_MODEL_MODALITIES_MAP_JSON; expected a JSON object.", {
      envKey: "AI_MODEL_MODALITIES_MAP_JSON",
      fallbackBehavior: "defaults_only",
    });
    return [];
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  const result: ModelModalityMapEntry[] = [];
  for (const [key, value] of entries) {
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey) {
      continue;
    }
    const modalities = parseModalities(value);
    if (!modalities) {
      logger.warn("Invalid model modalities entry; skipping key in AI_MODEL_MODALITIES_MAP_JSON.", {
        envKey: "AI_MODEL_MODALITIES_MAP_JSON",
        modelKey: key,
        fallbackBehavior: "entry_ignored",
      });
      continue;
    }
    result.push({ key: normalizedKey, modalities });
  }
  return result;
}

function parseAiProvider(rawValue: string | undefined): AiProvider {
  if (!rawValue) {
    return "openai";
  }
  if ((AI_PROVIDERS as readonly string[]).includes(rawValue)) {
    return rawValue as AiProvider;
  }
  logger.warn(`Invalid AI_PROVIDER "${rawValue}"; defaulting to "openai".`, {
    envKey: "AI_PROVIDER",
    invalidValue: rawValue,
    fallbackBehavior: "openai",
  });
  return "openai";
}

const provider = parseAiProvider(env.AI_PROVIDER);
const providerApiKey = (() => {
  const genericKey = (env.AI_PROVIDER_API_KEY || "").trim();
  if (genericKey) {
    return genericKey;
  }
  if (provider === "anthropic") {
    return (env.ANTHROPIC_API_KEY || "").trim();
  }
  if (provider === "google") {
    return (env.GOOGLE_GENERATIVE_AI_API_KEY || "").trim();
  }
  return (env.OPENAI_API_KEY || "").trim();
})();

export const aiProviderName = provider;
export const supportsOpenAiFileIds = provider === "openai";
export const isAiProviderConfigured = Boolean(providerApiKey);
const customModelModalityMap = parseModelModalityMap(env.AI_MODEL_MODALITIES_MAP_JSON);

const aiProviderClient = (() => {
  if (!isAiProviderConfigured) {
    return null;
  }
  if (provider === "anthropic") {
    return createAnthropic({ apiKey: providerApiKey });
  }
  if (provider === "google") {
    return createGoogleGenerativeAI({ apiKey: providerApiKey });
  }
  return createOpenAI({
    apiKey: providerApiKey,
  });
})();

export function getAiLanguageModel(model: string) {
  if (!aiProviderClient) {
    return null;
  }
  return aiProviderClient(model);
}

export function providerSupportsModalities(model: string, modalities: AiModality[]) {
  const requiresMultimodal = modalities.includes("image") || modalities.includes("file");
  if (!requiresMultimodal) {
    return true;
  }

  const normalizedModel = model.toLowerCase();
  if (KNOWN_TEXT_ONLY_MODEL_PREFIXES.some((prefix) => normalizedModel.startsWith(prefix))) {
    return false;
  }

  const providerModelKey = `${provider}:${normalizedModel}`;
  const entries = [
    ...customModelModalityMap,
    ...DEFAULT_MODEL_MODALITIES_BY_PROVIDER[provider].map((entry) => ({
      ...entry,
      key: `${provider}:${entry.key.toLowerCase()}`,
    })),
  ];

  const exactMatch = entries.find(
    (entry) => entry.key === providerModelKey || entry.key === normalizedModel,
  );
  if (exactMatch) {
    return modalities.every((modality) => exactMatch.modalities.includes(modality));
  }

  const wildcardMatches = entries
    .filter((entry) => entry.key.endsWith("*"))
    .filter((entry) => {
      const prefix = entry.key.slice(0, -1);
      return providerModelKey.startsWith(prefix) || normalizedModel.startsWith(prefix);
    })
    .sort((a, b) => b.key.length - a.key.length);

  if (wildcardMatches.length > 0) {
    return modalities.every((modality) => wildcardMatches[0]!.modalities.includes(modality));
  }

  // Fail closed for multimodal when no explicit/default capabilities match.
  return false;
}
