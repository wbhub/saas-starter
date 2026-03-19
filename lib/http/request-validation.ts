import { z, type ZodType } from "zod";

export async function parseJsonWithSchema<TSchema extends ZodType>(
  request: Request,
  schema: TSchema,
) {
  const body = await request.json().catch(() => null);
  return schema.safeParse(body);
}

export { z };
