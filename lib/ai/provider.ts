import "server-only";
import type { createAnthropic } from "@ai-sdk/anthropic";
import type { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { createOpenAI } from "@ai-sdk/openai";
import { type AiAccessMode, type AiModality } from "@/lib/ai/config";
import {
  AI_PROVIDER_NAMES,
  getAiProviderNameForModel,
  getCanonicalAiModelId,
  parseAiModelId,
  parseAiProviderName,
  type AiProviderName,
} from "@/lib/ai/provider-name";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { type DashboardAiUiGate } from "@/lib/dashboard/team-snapshot";
import { resolveAiAccess } from "@/lib/ai/access";
import { providerSupportsFileIds } from "@/lib/ai/attachments";

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

const defaultProvider = resolveAiProvider(env.AI_PROVIDER);

function getProviderApiKey(providerName: AiProviderName) {
  const genericKey = (env.AI_PROVIDER_API_KEY || "").trim();
  if (genericKey && providerName === defaultProvider) {
    return genericKey;
  }
  if (providerName === "anthropic") {
    return (env.ANTHROPIC_API_KEY || "").trim();
  }
  if (providerName === "google") {
    return (env.GOOGLE_GENERATIVE_AI_API_KEY || "").trim();
  }
  return (env.OPENAI_API_KEY || "").trim();
}

const configuredProviders = AI_PROVIDER_NAMES.filter((providerName) =>
  Boolean(getProviderApiKey(providerName)),
);
const configuredProviderSet = new Set<AiProviderName>(configuredProviders);

export const aiProviderName = defaultProvider;
export const supportsProviderFileIds = providerSupportsFileIds(defaultProvider);
export const isAiProviderConfigured = configuredProviders.length > 0;
const customModelModalityMap = parseModelModalityMap(env.AI_MODEL_MODALITIES_MAP_JSON);

function normalizeModelName(model: string) {
  return model.trim().toLowerCase();
}

function getNormalizedCanonicalModelId(model: string) {
  const parsedModel = parseAiModelId(model, defaultProvider);
  if (!parsedModel) {
    return null;
  }
  return `${parsedModel.providerName}:${normalizeModelName(parsedModel.modelId)}`;
}

function getDefaultProviderModelEntries(providerName: AiProviderName): ModelModalityMapEntry[] {
  return DEFAULT_MODEL_MODALITIES_BY_PROVIDER[providerName].map((entry) => ({
    ...entry,
    key: `${providerName}:${entry.key.toLowerCase()}`,
  }));
}

function getAllDefaultModelEntries() {
  return AI_PROVIDER_NAMES.flatMap((providerName) => getDefaultProviderModelEntries(providerName));
}

function getExplicitCustomModelEntries() {
  return customModelModalityMap.filter((entry) => !entry.key.endsWith("*"));
}

function findMatchingModelEntry(
  entries: readonly ModelModalityMapEntry[],
  model: string,
): ModelModalityMapEntry | null {
  const parsedModel = parseAiModelId(model, defaultProvider);
  if (!parsedModel) {
    return null;
  }

  const normalizedModel = normalizeModelName(parsedModel.modelId);
  const providerModelKey = `${parsedModel.providerName}:${normalizedModel}`;

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

const aiProviderClients: Partial<Record<AiProviderName, AiProviderClient | null | undefined>> = {};

export function isAiProviderConfiguredFor(providerName: AiProviderName) {
  return Boolean(getProviderApiKey(providerName));
}

export function isAiProviderConfiguredForModel(model: string | undefined) {
  return isAiProviderConfiguredFor(getAiProviderForModel(model));
}

export function getConfiguredAiProviders() {
  return [...configuredProviders];
}

export function getAiProviderForModel(model: string | undefined) {
  return getAiProviderNameForModel(model, defaultProvider);
}

export function modelSupportsProviderFileIds(model: string | undefined) {
  return providerSupportsFileIds(getAiProviderForModel(model));
}

async function getAiProviderClient(providerName: AiProviderName): Promise<AiProviderClient | null> {
  const cached = aiProviderClients[providerName];
  if (cached !== undefined) {
    return cached;
  }
  if (!isAiProviderConfiguredFor(providerName)) {
    aiProviderClients[providerName] = null;
    return null;
  }

  const apiKey = getProviderApiKey(providerName);
  if (!apiKey) {
    aiProviderClients[providerName] = null;
    return null;
  }

  if (providerName === "anthropic") {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    aiProviderClients[providerName] = createAnthropic({ apiKey });
  } else if (providerName === "google") {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    aiProviderClients[providerName] = createGoogleGenerativeAI({ apiKey });
  } else {
    const { createOpenAI } = await import("@ai-sdk/openai");
    aiProviderClients[providerName] = createOpenAI({ apiKey });
  }

  return aiProviderClients[providerName] ?? null;
}

export async function getAiLanguageModel(model: string) {
  const parsedModel = parseAiModelId(model, defaultProvider);
  if (!parsedModel) {
    return null;
  }

  const client = await getAiProviderClient(parsedModel.providerName);
  if (!client) {
    return null;
  }
  return client(parsedModel.modelId);
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
  if (!normalizedRequestedModel) {
    return false;
  }

  const canonicalRequestedModel = getNormalizedCanonicalModelId(requestedModel);
  const canonicalAllowedModel = getNormalizedCanonicalModelId(allowedModel);
  if (canonicalRequestedModel && canonicalRequestedModel === canonicalAllowedModel) {
    return true;
  }

  if (accessMode !== "all") {
    return false;
  }

  const allowlistEntries =
    customModelModalityMap.length > 0 ? customModelModalityMap : getAllDefaultModelEntries();
  return findMatchingModelEntry(allowlistEntries, requestedModel) !== null;
}

export function providerSupportsModalities(model: string, modalities: AiModality[]) {
  const requiresMultimodal = modalities.includes("image") || modalities.includes("file");
  if (!requiresMultimodal) {
    return true;
  }

  const parsedModel = parseAiModelId(model, defaultProvider);
  if (!parsedModel) {
    return false;
  }

  const normalizedModel = normalizeModelName(parsedModel.modelId);
  if (KNOWN_TEXT_ONLY_MODEL_PREFIXES.some((prefix) => normalizedModel.startsWith(prefix))) {
    return false;
  }

  const matchingEntry = findMatchingModelEntry(
    [...customModelModalityMap, ...getAllDefaultModelEntries()],
    parsedModel.canonicalModelId,
  );
  if (matchingEntry) {
    return modalities.every((modality) => matchingEntry.modalities.includes(modality));
  }

  return false;
}

export function getAvailableModels(aiUiGate?: DashboardAiUiGate): string[] {
  if (aiUiGate && aiUiGate.accessMode !== "all") {
    const access = resolveAiAccess({ effectivePlanKey: aiUiGate.effectivePlanKey });
    const canonicalModel = access.model
      ? getCanonicalAiModelId(access.model, defaultProvider)
      : null;
    return canonicalModel && isAiProviderConfiguredForModel(access.model ?? undefined)
      ? [canonicalModel]
      : [];
  }

  const entries = getExplicitCustomModelEntries();
  if (entries.length === 0) {
    const defaultAccess = resolveAiAccess({ effectivePlanKey: aiUiGate?.effectivePlanKey ?? null });
    const canonicalModel = defaultAccess.model
      ? getCanonicalAiModelId(defaultAccess.model, defaultProvider)
      : null;
    return canonicalModel && isAiProviderConfiguredForModel(defaultAccess.model ?? undefined)
      ? [canonicalModel]
      : [];
  }

  const models = new Set<string>();
  for (const entry of entries) {
    const parsedModel = parseAiModelId(entry.key, defaultProvider);
    if (!parsedModel || !configuredProviderSet.has(parsedModel.providerName)) {
      continue;
    }
    models.add(parsedModel.canonicalModelId);
  }

  return Array.from(models);
}
