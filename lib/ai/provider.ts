import "server-only";
import type { createAnthropic } from "@ai-sdk/anthropic";
import type { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { createOpenAI } from "@ai-sdk/openai";
import { type AiAccessMode, type AiModality } from "@/lib/ai/config";
import { parseAiProviderName, type AiProviderName } from "@/lib/ai/provider-name";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { type DashboardAiUiGate } from "@/lib/dashboard/team-snapshot";
import { resolveAiAccess } from "@/lib/ai/access";

const KNOWN_TEXT_ONLY_MODEL_PREFIXES = ["gpt-3.5"] as const;
const ALL_MODALITIES = ["text", "image", "file"] as const satisfies readonly AiModality[];

type ModelModalityMapEntry = {
  key: string;
  modalities: readonly AiModality[];
};

const DEFAULT_MODEL_MODALITIES_BY_PROVIDER: Record<
  AiProviderName,
  readonly ModelModalityMapEntry[]
> = {
  openai: [
    { key: "gpt-3.5*", modalities: ["text"] },
    { key: "gpt-4.1*", modalities: ["text", "image", "file"] },
    { key: "gpt-4o*", modalities: ["text", "image", "file"] },
    { key: "gpt-5.4*", modalities: ["text", "image", "file"] },
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

function resolveAiProvider(rawValue: string | undefined) {
  const parsed = parseAiProviderName(rawValue);
  if (rawValue && parsed === "openai" && rawValue !== "openai") {
    logger.warn(`Invalid AI_PROVIDER "${rawValue}"; defaulting to "openai".`, {
      envKey: "AI_PROVIDER",
      invalidValue: rawValue,
      fallbackBehavior: "openai",
    });
  }
  return parsed;
}

const provider = resolveAiProvider(env.AI_PROVIDER);

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
export const supportsProviderFileIds = provider === "openai";
export const isAiProviderConfigured = Boolean(providerApiKey);
const customModelModalityMap = parseModelModalityMap(env.AI_MODEL_MODALITIES_MAP_JSON);

function normalizeModelName(model: string) {
  return model.trim().toLowerCase();
}

function getDefaultProviderModelEntries(): ModelModalityMapEntry[] {
  return DEFAULT_MODEL_MODALITIES_BY_PROVIDER[provider].map((entry) => ({
    ...entry,
    key: `${provider}:${entry.key.toLowerCase()}`,
  }));
}

function findMatchingModelEntry(
  entries: readonly ModelModalityMapEntry[],
  model: string,
): ModelModalityMapEntry | null {
  const normalizedModel = normalizeModelName(model);
  const providerModelKey = `${provider}:${normalizedModel}`;

  const exactMatch = entries.find(
    (entry) => entry.key === providerModelKey || entry.key === normalizedModel,
  );
  if (exactMatch) {
    return exactMatch;
  }

  return (
    entries
      .filter((entry) => entry.key.endsWith("*"))
      .filter((entry) => {
        const prefix = entry.key.slice(0, -1);
        return providerModelKey.startsWith(prefix) || normalizedModel.startsWith(prefix);
      })
      .sort((a, b) => b.key.length - a.key.length)[0] ?? null
  );
}

type AiProviderClient =
  | ReturnType<typeof createAnthropic>
  | ReturnType<typeof createGoogleGenerativeAI>
  | ReturnType<typeof createOpenAI>;

let aiProviderClient: AiProviderClient | null | undefined;

async function getAiProviderClient(): Promise<AiProviderClient | null> {
  if (aiProviderClient !== undefined) {
    return aiProviderClient;
  }
  if (!isAiProviderConfigured) {
    aiProviderClient = null;
    return null;
  }
  if (provider === "anthropic") {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    aiProviderClient = createAnthropic({ apiKey: providerApiKey });
  } else if (provider === "google") {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    aiProviderClient = createGoogleGenerativeAI({ apiKey: providerApiKey });
  } else {
    const { createOpenAI } = await import("@ai-sdk/openai");
    aiProviderClient = createOpenAI({ apiKey: providerApiKey });
  }
  return aiProviderClient;
}

export async function getAiLanguageModel(model: string) {
  const client = await getAiProviderClient();
  if (!client) {
    return null;
  }
  return client(model);
}

export function isRequestedModelAllowed({
  requestedModel,
  accessMode,
  allowedModel,
}: {
  requestedModel: string;
  accessMode: AiAccessMode;
  allowedModel: string;
}) {
  const normalizedRequestedModel = normalizeModelName(requestedModel);
  const normalizedAllowedModel = normalizeModelName(allowedModel);
  if (!normalizedRequestedModel) {
    return false;
  }

  if (normalizedRequestedModel === normalizedAllowedModel) {
    return true;
  }

  if (accessMode !== "all") {
    return false;
  }

  const allowlistEntries =
    customModelModalityMap.length > 0 ? customModelModalityMap : getDefaultProviderModelEntries();
  return findMatchingModelEntry(allowlistEntries, normalizedRequestedModel) !== null;
}

export function providerSupportsModalities(model: string, modalities: AiModality[]) {
  const requiresMultimodal = modalities.includes("image") || modalities.includes("file");
  if (!requiresMultimodal) {
    return true;
  }

  const normalizedModel = normalizeModelName(model);
  if (KNOWN_TEXT_ONLY_MODEL_PREFIXES.some((prefix) => normalizedModel.startsWith(prefix))) {
    return false;
  }

  const matchingEntry = findMatchingModelEntry(
    [...customModelModalityMap, ...getDefaultProviderModelEntries()],
    normalizedModel,
  );
  if (matchingEntry) {
    return modalities.every((modality) => matchingEntry.modalities.includes(modality));
  }

  // Fail closed for multimodal when no explicit/default capabilities match.
  return false;
}

export function getAvailableModels(aiUiGate?: DashboardAiUiGate): string[] {
  if (aiUiGate && aiUiGate.accessMode !== "all") {
    const access = resolveAiAccess({ effectivePlanKey: aiUiGate.effectivePlanKey });
    if (access.model) {
      return [access.model];
    }
    return [];
  }

  const entries =
    customModelModalityMap.length > 0 ? customModelModalityMap : getDefaultProviderModelEntries();

  const models = new Set<string>();
  for (const entry of entries) {
    if (entry.key.startsWith(`${provider}:`)) {
      let modelName = entry.key.slice(provider.length + 1);
      if (modelName.endsWith("*")) {
        modelName = modelName.slice(0, -1);
      }
      models.add(modelName);
    }
  }

  return Array.from(models);
}
