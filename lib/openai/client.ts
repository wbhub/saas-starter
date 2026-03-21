import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import { env } from "@/lib/env";

const openAiApiKey = env.OPENAI_API_KEY;

export const isOpenAiConfigured = Boolean(openAiApiKey);

export const openai = openAiApiKey
  ? createOpenAI({
      apiKey: openAiApiKey,
    })
  : null;
