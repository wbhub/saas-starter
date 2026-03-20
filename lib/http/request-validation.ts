import { z, type ZodType } from "zod";

const DEFAULT_MAX_JSON_BYTES = 256 * 1024;

type ParseJsonOptions = {
  maxBytes?: number;
};

type ParseJsonResult<TSchema extends ZodType> = ReturnType<TSchema["safeParse"]> & {
  tooLarge?: boolean;
};

export async function parseJsonWithSchema<TSchema extends ZodType>(
  request: Request,
  schema: TSchema,
  options: ParseJsonOptions = {},
): Promise<ParseJsonResult<TSchema>> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_JSON_BYTES;
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : Number.NaN;
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      success: false,
      error: new z.ZodError([]),
      tooLarge: true,
    } as ParseJsonResult<TSchema>;
  }

  const rawBody = await request.text().catch(() => "");
  if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
    return {
      success: false,
      error: new z.ZodError([]),
      tooLarge: true,
    } as ParseJsonResult<TSchema>;
  }

  const body = (() => {
    if (rawBody.length === 0) {
      return null;
    }
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  })();
  return schema.safeParse(body) as ParseJsonResult<TSchema>;
}

export { z };
