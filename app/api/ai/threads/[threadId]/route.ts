import { withTeamRoute } from "@/lib/http/team-route";
import { jsonSuccess, jsonError } from "@/lib/http/api-json";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { getThread, renameThread, deleteThread } from "@/lib/ai/threads";
import { z } from "@/lib/http/request-validation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ threadId: string }> };

const renameSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export async function GET(request: Request, context: RouteContext) {
  const t = await getRouteTranslator("ApiAiThreads", request);
  const { threadId } = await context.params;

  return withTeamRoute({
    request,
    unauthorizedMessage: t("errors.unauthorized"),
    missingTeamMembershipMessage: t("errors.noTeamMembership"),
    handler: async ({ user, teamContext }) => {
      if (!UUID_RE.test(threadId)) {
        return jsonError(t("errors.invalidThreadId"), 400);
      }

      const thread = await getThread({
        threadId,
        teamId: teamContext.teamId,
        userId: user.id,
      });

      if (!thread) {
        return jsonError(t("errors.threadNotFound"), 404);
      }

      return jsonSuccess({ thread });
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const t = await getRouteTranslator("ApiAiThreads", request);
  const { threadId } = await context.params;

  return withTeamRoute({
    request,
    schema: renameSchema,
    unauthorizedMessage: t("errors.unauthorized"),
    missingTeamMembershipMessage: t("errors.noTeamMembership"),
    invalidPayloadMessage: t("errors.invalidPayload"),
    rateLimits: ({ teamId, userId }) => [
      {
        key: `ai-thread-update:${teamId}:${userId}`,
        ...RATE_LIMITS.aiThreadUpdateByUser,
        message: t("errors.rateLimited"),
      },
    ],
    handler: async ({ user, teamContext, body }) => {
      if (!UUID_RE.test(threadId)) {
        return jsonError(t("errors.invalidThreadId"), 400);
      }

      const thread = await renameThread({
        threadId,
        teamId: teamContext.teamId,
        userId: user.id,
        title: body.title,
      });

      if (!thread) {
        return jsonError(t("errors.threadNotFound"), 404);
      }

      logAuditEvent({
        action: "ai.thread.rename",
        outcome: "success",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        resourceId: threadId,
      });

      return jsonSuccess({ thread });
    },
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const t = await getRouteTranslator("ApiAiThreads", request);
  const { threadId } = await context.params;

  return withTeamRoute({
    request,
    unauthorizedMessage: t("errors.unauthorized"),
    missingTeamMembershipMessage: t("errors.noTeamMembership"),
    rateLimits: ({ teamId, userId }) => [
      {
        key: `ai-thread-delete:${teamId}:${userId}`,
        ...RATE_LIMITS.aiThreadDeleteByUser,
        message: t("errors.rateLimited"),
      },
    ],
    handler: async ({ user, teamContext }) => {
      if (!UUID_RE.test(threadId)) {
        return jsonError(t("errors.invalidThreadId"), 400);
      }

      const deleteResult = await deleteThread({
        threadId,
        teamId: teamContext.teamId,
        userId: user.id,
      });

      if (deleteResult === "error") {
        return jsonError(t("errors.deleteFailed"), 500);
      }
      if (deleteResult === "not_found") {
        return jsonError(t("errors.threadNotFound"), 404);
      }

      logAuditEvent({
        action: "ai.thread.delete",
        outcome: "success",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        resourceId: threadId,
      });

      return jsonSuccess({});
    },
  });
}
