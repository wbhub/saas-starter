import { withTeamRoute } from "@/lib/http/team-route";
import { jsonSuccess, jsonError } from "@/lib/http/api-json";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createThread, listThreads } from "@/lib/ai/threads";
import { z } from "@/lib/http/request-validation";

const createThreadSchema = z.object({
  title: z.string().trim().max(200).optional(),
});

export async function GET(request: Request) {
  const t = await getRouteTranslator("ApiAiThreads", request);

  return withTeamRoute({
    request,
    unauthorizedMessage: t("errors.unauthorized"),
    missingTeamMembershipMessage: t("errors.noTeamMembership"),
    rateLimits: ({ teamId, userId }) => [
      {
        key: `ai-thread-list:${teamId}:${userId}`,
        ...RATE_LIMITS.aiThreadListByUser,
        message: t("errors.rateLimited"),
      },
    ],
    handler: async ({ user, teamContext }) => {
      const threads = await listThreads({
        teamId: teamContext.teamId,
        userId: user.id,
      });
      return jsonSuccess({ threads });
    },
  });
}

export async function POST(request: Request) {
  const t = await getRouteTranslator("ApiAiThreads", request);

  return withTeamRoute({
    request,
    schema: createThreadSchema,
    unauthorizedMessage: t("errors.unauthorized"),
    missingTeamMembershipMessage: t("errors.noTeamMembership"),
    invalidPayloadMessage: t("errors.invalidPayload"),
    rateLimits: ({ teamId, userId }) => [
      {
        key: `ai-thread-create:${teamId}:${userId}`,
        ...RATE_LIMITS.aiThreadCreateByUser,
        message: t("errors.rateLimited"),
      },
    ],
    handler: async ({ user, teamContext, body }) => {
      const thread = await createThread({
        teamId: teamContext.teamId,
        userId: user.id,
        title: body.title,
      });

      if (!thread) {
        return jsonError(t("errors.createFailed"), 500);
      }

      logAuditEvent({
        action: "ai.thread.create",
        outcome: "success",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        resourceId: thread.id,
      });

      return jsonSuccess({ thread }, { status: 201 });
    },
  });
}
