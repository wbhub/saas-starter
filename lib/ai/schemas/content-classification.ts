import { z } from "zod";
import type { AiSchemaEntry } from "./types";

export const contentClassificationSchema: AiSchemaEntry = {
  schema: z.object({
    categories: z
      .array(
        z.object({
          label: z.string().describe("The category label."),
          confidence: z.number().min(0).max(1).describe("Confidence score between 0 and 1."),
        }),
      )
      .describe("Categories the text belongs to, sorted by confidence descending."),
    primaryCategory: z.string().describe("The single most relevant category."),
    tone: z
      .enum(["formal", "informal", "technical", "casual", "academic", "conversational"])
      .describe("The overall tone of the text."),
    language: z.string().describe("The detected language of the text (ISO 639-1 code)."),
  }),
  description: "Classify the given text into categories and detect its tone and language.",
};
