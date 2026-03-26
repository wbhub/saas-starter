import { z } from "zod";
import type { AiSchemaEntry } from "./types";

export const sentimentSchema: AiSchemaEntry = {
  schema: z.object({
    sentiment: z.enum(["positive", "negative", "neutral"]).describe("The overall sentiment."),
    confidence: z.number().min(0).max(1).describe("Confidence score between 0 and 1."),
    reasoning: z.string().describe("Brief explanation of the sentiment classification."),
  }),
  description: "Analyze the sentiment of the given text.",
};
