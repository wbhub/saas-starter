import { type ZodType } from "zod";
import { requireJsonContentType } from "@/lib/http/content-type";
import { getOrCreateRequestId, jsonWithRequestId, withRequestId } from "@/lib/http/request-id";
import { parseJsonWithSchema } from "@/lib/http/request-validation";
import { checkRateLimit, type RateLimitDescriptor } from "@/lib/security/rate-limit";
import { verifyCsrfProtection, type CsrfErrorMessages } from "@/lib/security/csrf";
import { createClient } from "@/lib/supabase/server";

type AuthedRouteContext<TBody> = {
  request: Request;
  requestId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: NonNullable<
    Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>["auth"]["getUser"]>>["data"]["user"]
  >;
  body: TBody;
};

type AuthedRouteOptions<TBody> = {
  request: Request;
  csrfMessages?: CsrfErrorMessages;
  contentTypeMessage?: string;
  requireJsonBody?: boolean;
  schema?: ZodType<TBody>;
  invalidPayloadMessage?: string;
  payloadTooLargeMessage?: string;
  unauthorizedMessage?: string;
  tooManyRequestsMessage?: string;
  onInvalidPayload?: (ctx: { userId: string }) => void;
  rateLimits?: (ctx: {
    request: Request;
    userId: string;
  }) => RateLimitDescriptor[];
  handler: (ctx: AuthedRouteContext<TBody>) => Promise<Response>;
};

export async function withAuthedRoute<TBody = undefined>({
  request,
  csrfMessages,
  contentTypeMessage,
  requireJsonBody = false,
  schema,
  invalidPayloadMessage = "Invalid request payload.",
  payloadTooLargeMessage = "Request payload is too large.",
  unauthorizedMessage = "Unauthorized",
  tooManyRequestsMessage = "Too many requests. Please try again shortly.",
  onInvalidPayload,
  rateLimits,
  handler,
}: AuthedRouteOptions<TBody>) {
  const requestId = getOrCreateRequestId(request);
  const jsonErr = (error: string, status: number, init?: ResponseInit) =>
    jsonWithRequestId(requestId, { ok: false as const, error }, { ...init, status });

  const csrfError = verifyCsrfProtection(request, csrfMessages);
  if (csrfError) {
    return withRequestId(csrfError, requestId);
  }

  if (requireJsonBody || schema) {
    const contentTypeError = requireJsonContentType(request, {
      errorMessage: contentTypeMessage,
    });
    if (contentTypeError) {
      return withRequestId(contentTypeError, requestId);
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonErr(unauthorizedMessage, 401);
  }

  if (rateLimits) {
    const descriptors = rateLimits({ request, userId: user.id });
    if (descriptors.length > 0) {
      const results = await Promise.all(descriptors.map((descriptor) => checkRateLimit(descriptor)));
      const deniedIndex = results.findIndex((result) => !result.allowed);
      if (deniedIndex >= 0) {
        const retryAfterSeconds = Math.max(...results.map((result) => result.retryAfterSeconds));
        return jsonWithRequestId(
          requestId,
          { ok: false as const, error: descriptors[deniedIndex]?.message ?? tooManyRequestsMessage },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfterSeconds) },
          },
        );
      }
    }
  }

  let body = undefined as TBody;
  if (schema) {
    const bodyParse = await parseJsonWithSchema(request, schema);
    if (!bodyParse.success) {
      if (bodyParse.tooLarge) {
        return jsonErr(payloadTooLargeMessage, 413);
      }
      onInvalidPayload?.({ userId: user.id });
      return jsonErr(invalidPayloadMessage, 400);
    }
    body = bodyParse.data;
  }

  const response = await handler({
    request,
    requestId,
    supabase,
    user,
    body,
  });
  return withRequestId(response, requestId);
}
