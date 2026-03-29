import { type ZodType } from "zod";
import { requireJsonContentType } from "@/lib/http/content-type";
import { getOrCreateRequestId, jsonWithRequestId, withRequestId } from "@/lib/http/request-id";
import { parseJsonWithSchema } from "@/lib/http/request-validation";
import { checkRateLimit, type RateLimitDescriptor } from "@/lib/security/rate-limit";
import { verifyCsrfProtection, type CsrfErrorMessages } from "@/lib/security/csrf";
import { createClient } from "@/lib/supabase/server";
import { type TeamContext, type TeamRole } from "@/lib/team-context";
import { getCachedTeamContextForUser } from "@/lib/team-context-cache";

export type { RateLimitDescriptor };

type TeamRouteContext<TBody> = {
  request: Request;
  requestId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: NonNullable<
    Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>["auth"]["getUser"]>>["data"]["user"]
  >;
  teamContext: TeamContext;
  body: TBody;
};

type TeamRouteOptions<TBody> = {
  request: Request;
  allowedRoles?: TeamRole[];
  csrfMessages?: CsrfErrorMessages;
  contentTypeMessage?: string;
  forbiddenMessage?: string;
  unauthorizedMessage?: string;
  missingTeamMembershipMessage?: string;
  requireJsonBody?: boolean;
  schema?: ZodType<TBody>;
  invalidPayloadMessage?: string;
  payloadTooLargeMessage?: string;
  tooManyRequestsMessage?: string;
  onInvalidPayload?: (ctx: { userId: string; teamId: string }) => void;
  rateLimits?: (ctx: {
    request: Request;
    userId: string;
    teamId: string;
    role: TeamRole;
  }) => RateLimitDescriptor[];
  handler: (ctx: TeamRouteContext<TBody>) => Promise<Response>;
};

export async function withTeamRoute<TBody = undefined>({
  request,
  allowedRoles,
  csrfMessages,
  contentTypeMessage,
  forbiddenMessage,
  unauthorizedMessage,
  missingTeamMembershipMessage,
  requireJsonBody = false,
  schema,
  invalidPayloadMessage = "Invalid request payload.",
  payloadTooLargeMessage = "Request payload is too large.",
  tooManyRequestsMessage = "Too many requests. Please try again shortly.",
  onInvalidPayload,
  rateLimits,
  handler,
}: TeamRouteOptions<TBody>) {
  const requestId = getOrCreateRequestId(request);
  const json = (body: unknown, init?: ResponseInit) => jsonWithRequestId(requestId, body, init);
  const jsonErr = (error: string, status: number, init?: ResponseInit) =>
    jsonWithRequestId(requestId, { ok: false as const, error }, { ...init, status });

  const isSafeMethod =
    request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS";
  if (!isSafeMethod) {
    const csrfError = verifyCsrfProtection(request, csrfMessages);
    if (csrfError) {
      return withRequestId(csrfError, requestId);
    }
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
    return jsonErr(unauthorizedMessage ?? "Unauthorized", 401);
  }

  const teamContext = await getCachedTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return jsonErr(
      missingTeamMembershipMessage ?? "No team membership found for this account.",
      403,
    );
  }

  if (allowedRoles && !allowedRoles.includes(teamContext.role)) {
    return jsonErr(forbiddenMessage ?? "You do not have permission to perform this action.", 403);
  }

  if (rateLimits) {
    const descriptors = rateLimits({
      request,
      userId: user.id,
      teamId: teamContext.teamId,
      role: teamContext.role,
    });
    if (descriptors.length > 0) {
      const results = await Promise.all(
        descriptors.map((descriptor) => checkRateLimit(descriptor)),
      );
      const deniedIndex = results.findIndex((result) => !result.allowed);
      if (deniedIndex >= 0) {
        const retryAfterSeconds = Math.max(...results.map((result) => result.retryAfterSeconds));
        return json(
          {
            ok: false as const,
            error: descriptors[deniedIndex]?.message ?? tooManyRequestsMessage,
          },
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
      onInvalidPayload?.({ userId: user.id, teamId: teamContext.teamId });
      return jsonErr(invalidPayloadMessage, 400);
    }
    body = bodyParse.data;
  }

  const response = await handler({
    request,
    requestId,
    supabase,
    user,
    teamContext,
    body,
  });
  return withRequestId(response, requestId);
}
