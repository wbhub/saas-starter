import { z, type ZodType } from "zod";

const DEFAULT_MAX_JSON_BYTES = 256 * 1024;

type ParseJsonOptions = {
  maxBytes?: number;
};

type ParseJsonResult<TSchema extends ZodType> = ReturnType<TSchema["safeParse"]> & {
  tooLarge?: boolean;
};

async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<{ text: string; tooLarge: boolean }> {
  if (!request.body) {
    return { text: "", tooLarge: false };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { text: "", tooLarge: true };
      }
      chunks.push(value);
    }
  } catch {
    return { text: "", tooLarge: false };
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(merged), tooLarge: false };
}

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

  const bodyRead = await readBodyWithLimit(request, maxBytes);
  if (bodyRead.tooLarge) {
    return {
      success: false,
      error: new z.ZodError([]),
      tooLarge: true,
    } as ParseJsonResult<TSchema>;
  }

  const rawBody = bodyRead.text;
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
