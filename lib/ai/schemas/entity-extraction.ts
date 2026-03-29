import { z } from "zod";
import type { AiSchemaEntry } from "./types";

export const entityExtractionSchema: AiSchemaEntry = {
  schema: z.object({
    entities: z
      .array(
        z.object({
          name: z.string().describe("The entity name as it appears in the text."),
          type: z
            .enum(["person", "organization", "location", "date", "product", "other"])
            .describe("The entity type."),
          context: z.string().describe("A brief phrase showing how the entity is referenced."),
        }),
      )
      .describe("All named entities found in the text."),
    summary: z.string().describe("A one-sentence summary of what the text is about."),
  }),
  description:
    "Extract named entities (people, organizations, locations, etc.) from the given text.",
};
