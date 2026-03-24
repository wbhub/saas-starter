import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { withTeamRoute } from "@/lib/http/team-route";
import { z } from "@/lib/http/request-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateCachedTeamContextForUser } from "@/lib/team-context-cache";
import { logger } from "@/lib/logger";
import { getRouteTranslator } from "@/lib/i18n/locale";

const teamSettingsSchema = z.object({
  teamName: z.string().trim().min(2).max(80),
});

type TeamMembershipUserRow = {
  user_id: string;
};

export async function PATCH(request: Request) {
  const t = await getRouteTranslator("ApiTeamSettings", request);

  return withTeamRoute({
    request,
    allowedRoles: ["owner", "admin"],
    unauthorizedMessage: t("errors.unauthorized"),
    missingTeamMembershipMessage: t("errors.noTeamMembership"),
    forbiddenMessage: t("errors.forbidden"),
    schema: teamSettingsSchema,
    invalidPayloadMessage: t("errors.invalidPayload"),
    payloadTooLargeMessage: t("errors.payloadTooLarge"),
    rateLimits: ({ teamId, userId }) => [
      {
        key: `team-settings:update:${teamId}:${userId}`,
        ...RATE_LIMITS.teamSettingsUpdateByActor,
        message: t("errors.rateLimited"),
      },
    ],
    handler: async ({ supabase, user, teamContext, body }) => {
      const { teamName } = body;
      const { error } = await supabase
        .from("teams")
        .update({ name: teamName })
        .eq("id", teamContext.teamId);

      if (error) {
        logger.error("Failed to update organization settings", error);
        logAuditEvent({
          action: "team.settings.update",
          outcome: "failure",
          actorUserId: user.id,
          teamId: teamContext.teamId,
          metadata: { reason: "update_error" },
        });
        return jsonError(t("errors.unableToUpdate"), 500);
      }

      const admin = createAdminClient();
      const { data: teamMembers, error: teamMembersError } = await admin
        .from("team_memberships")
        .select("user_id")
        .eq("team_id", teamContext.teamId)
        .returns<TeamMembershipUserRow[]>();

      if (teamMembersError) {
        logger.warn("Failed to load team members for team-context cache invalidation", {
          teamId: teamContext.teamId,
          actorUserId: user.id,
          error: teamMembersError,
        });
        await invalidateCachedTeamContextForUser(user.id);
      } else {
        const userIds = new Set((teamMembers ?? []).map((membership) => membership.user_id));
        if (userIds.size === 0) {
          userIds.add(user.id);
        }
        await Promise.all(
          Array.from(userIds, (memberUserId) => invalidateCachedTeamContextForUser(memberUserId)),
        );
      }

      logAuditEvent({
        action: "team.settings.update",
        outcome: "success",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        metadata: { teamName },
      });
      return jsonSuccess();
    },
  });
}
