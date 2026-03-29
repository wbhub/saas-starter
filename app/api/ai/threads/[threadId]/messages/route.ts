import { withTeamRoute } from "@/lib/http/team-route";
import { jsonSuccess, jsonError } from "@/lib/http/api-json";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { loadThreadMessages } from "@/lib/ai/threads";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ threadId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const t = await getRouteTranslator("ApiAiThreads", request);
  const { threadId } = await context.params;

  return withTeamRoute({
    request,
    unauthorizedMessage: t("errors.unauthorized"),
    missingTeamMembershipMessage: t("errors.noTeamMembership"),
    rateLimits: ({ teamId, userId }) => [
      {
        key: `ai-thread-messages:${teamId}:${userId}`,
        ...RATE_LIMITS.aiThreadListByUser,
        message: t("errors.rateLimited"),
      },
    ],
    handler: async ({ user, teamContext }) => {
      if (!UUID_RE.test(threadId)) {
        return jsonError(t("errors.invalidThreadId"), 400);
      }

      // loadThreadMessages verifies thread ownership internally
      const messages = await loadThreadMessages({
        threadId,
        teamId: teamContext.teamId,
        userId: user.id,
      });

      return jsonSuccess({ messages });
    },
  });
}
