import type { ZodType } from "zod";

export type AiSchemaEntry = {
  /** Zod schema defining the expected structured output shape. */
  schema: ZodType;
  /** Instruction passed to the model describing what to generate. */
  description: string;
};
