"use client";

import { parseAiModelId } from "@/lib/ai/provider-name";

const MODEL_TOKEN_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  claude: "Claude",
  flash: "Flash",
  gemini: "Gemini",
  google: "Google",
  gpt: "GPT",
  haiku: "Haiku",
  lite: "Lite",
  mini: "Mini",
  nano: "Nano",
  openai: "OpenAI",
  opus: "Opus",
  preview: "Preview",
  pro: "Pro",
  sonnet: "Sonnet",
};

function capitalizeToken(token: string) {
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function formatModelName(modelId: string) {
  const normalizedModelId = modelId.trim().toLowerCase();
  const segments = normalizedModelId.split("-").filter(Boolean);
  if (!segments.length) {
    return modelId;
  }

  if (segments[0] === "gpt") {
    const version = segments[1] ?? "";
    const suffixes = segments.slice(2);
    const suffixLabel = suffixes
      .map((segment) => MODEL_TOKEN_LABELS[segment] ?? capitalizeToken(segment))
      .join(" ");
    return [`GPT-${version}`, suffixLabel].filter(Boolean).join(" ");
  }

  const formattedSegments: string[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const nextSegment = segments[index + 1];
    if (/^\d+$/.test(segment) && typeof nextSegment === "string" && /^\d+$/.test(nextSegment)) {
      formattedSegments.push(`${segment}.${nextSegment}`);
      index += 1;
      continue;
    }
    formattedSegments.push(MODEL_TOKEN_LABELS[segment] ?? capitalizeToken(segment));
  }

  return formattedSegments.join(" ");
}

export function formatAiModelLabel(modelId: string) {
  const parsedModel = parseAiModelId(modelId);
  if (!parsedModel) {
    return modelId;
  }
  return formatModelName(parsedModel.modelId);
}
