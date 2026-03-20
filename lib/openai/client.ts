import "server-only";
import OpenAI from "openai";
import { env } from "@/lib/env";

const openAiApiKey = env.OPENAI_API_KEY;

export const isOpenAiConfigured = Boolean(openAiApiKey);

export const openai = openAiApiKey
  ? new OpenAI({
      apiKey: openAiApiKey,
    })
  : null;
