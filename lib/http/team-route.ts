import { type ZodType } from "zod";
import { requireJsonContentType } from "@/lib/http/content-type";
import { getOrCreateRequestId, jsonWithRequestId, withRequestId } from "@/lib/http/request-id";
import { parseJsonWithSchema } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { createClient } from "@/lib/supabase/server";
import { type TeamContext, type TeamRole } from "@/lib/team-context";
import { getCachedTeamContextForUser } from "@/lib/team-context-cache";

type RateLimitDescriptor = {
  key: string;
  limit: number;
  windowMs: number;
  message: string;
};

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
  const json = (
    body: unknown,
    init?: ResponseInit,
  ) => jsonWithRequestId(requestId, body, init);

  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return withRequestId(csrfError, requestId);
  }

  if (requireJsonBody || schema) {
    const contentTypeError = requireJsonContentType(request);
    if (contentTypeError) {
      return withRequestId(contentTypeError, requestId);
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: unauthorizedMessage ?? "Unauthorized" }, { status: 401 });
  }

  const teamContext = await getCachedTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return json(
      { error: missingTeamMembershipMessage ?? "No team membership found for this account." },
      { status: 403 },
    );
  }

  if (allowedRoles && !allowedRoles.includes(teamContext.role)) {
    return json(
      { error: forbiddenMessage ?? "You do not have permission to perform this action." },
      { status: 403 },
    );
  }

  if (rateLimits) {
    const descriptors = rateLimits({
      request,
      userId: user.id,
      teamId: teamContext.teamId,
      role: teamContext.role,
    });
    if (descriptors.length > 0) {
      const results = await Promise.all(descriptors.map((descriptor) => checkRateLimit(descriptor)));
      const deniedIndex = results.findIndex((result) => !result.allowed);
      if (deniedIndex >= 0) {
        const retryAfterSeconds = Math.max(...results.map((result) => result.retryAfterSeconds));
        return json(
          { error: descriptors[deniedIndex]?.message ?? tooManyRequestsMessage },
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
        return json({ error: payloadTooLargeMessage }, { status: 413 });
      }
      onInvalidPayload?.({ userId: user.id, teamId: teamContext.teamId });
      return json({ error: invalidPayloadMessage }, { status: 400 });
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
