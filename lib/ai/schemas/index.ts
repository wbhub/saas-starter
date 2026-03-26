import { sentimentSchema } from "./sentiment";
import type { AiSchemaEntry } from "./types";

export type { AiSchemaEntry } from "./types";

/**
 * Registry of named schemas available to the `/api/ai/object` endpoint.
 *
 * To add a new schema:
 * 1. Create a file in `lib/ai/schemas/` exporting an `AiSchemaEntry`.
 * 2. Import it here and add it to the map.
 * 3. On the client, pass the key as `schemaName` and use the matching Zod
 *    schema with `useObject` for type-safe streaming.
 */
export const AI_SCHEMA_MAP: Record<string, AiSchemaEntry> = {
  sentiment: sentimentSchema,
};
