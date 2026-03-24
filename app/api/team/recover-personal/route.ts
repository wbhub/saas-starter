import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { withAuthedRoute } from "@/lib/http/authed-route";
import { recoverPersonalTeamForUser } from "@/lib/team-recovery";
import { logger } from "@/lib/logger";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { invalidateCachedTeamContextForUser } from "@/lib/team-context-cache";

export async function POST(request: Request) {
  const t = await getRouteTranslator("ApiTeamRecoverPersonal", request);

  return withAuthedRoute({
    request,
    unauthorizedMessage: t("errors.unauthorized"),
    rateLimits: ({ userId }) => [
      {
        key: `team-recovery:user:${userId}`,
        ...RATE_LIMITS.teamRecoveryByUser,
        message: t("errors.rateLimited"),
      },
    ],
    handler: async ({ user }) => {
      if (!user.email) {
        return jsonError(t("errors.noEmailOnAccount"), 400);
      }

      try {
        const teamId = await recoverPersonalTeamForUser(
          user.id,
          user.email,
          typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
        );
        await invalidateCachedTeamContextForUser(user.id);
        return jsonSuccess({ teamId });
      } catch (error) {
        logger.error("Failed to recover personal team", error);
        return jsonError(t("errors.unableToRecover"), 500);
      }
    },
  });
}
