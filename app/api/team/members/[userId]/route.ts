import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { withTeamRoute } from "@/lib/http/team-route";
import { z } from "@/lib/http/request-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateCachedDashboardTeamSnapshot } from "@/lib/dashboard/team-snapshot-cache";
import { invalidateCachedTeamContextForUser } from "@/lib/team-context-cache";
import { syncTeamSeatQuantity } from "@/lib/stripe/seats";
import { enqueueSeatSyncRetry } from "@/lib/stripe/seat-sync-retries";
import { logger } from "@/lib/logger";
import { getRouteTranslator } from "@/lib/i18n/locale";

type TeamMembershipRow = {
  user_id: string;
  role: "owner" | "admin" | "member";
};

type TeamMembersRouteContext = {
  params: Promise<{ userId: string }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const updateMemberRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

export async function DELETE(request: Request, context: TeamMembersRouteContext) {
  const t = await getRouteTranslator("ApiTeamMembers", request);

  return withTeamRoute({
    request,
    allowedRoles: ["owner", "admin"],
    unauthorizedMessage: t("errors.unauthorized"),
    missingTeamMembershipMessage: t("errors.noTeamMembership"),
    forbiddenMessage: t("errors.removeForbidden"),
    rateLimits: ({ teamId, userId }) => [
      {
        key: `team-member-remove:${teamId}:${userId}`,
        ...RATE_LIMITS.teamMemberRemoveByActor,
        message: t("errors.rateLimited"),
      },
    ],
    handler: async ({ user, teamContext }) => {
      const { userId: targetUserId } = await context.params;
      if (!UUID_RE.test(targetUserId)) {
        return jsonError(t("errors.invalidMemberId"), 400);
      }

      if (targetUserId === user.id) {
        logAuditEvent({
          action: "team.member.remove",
          outcome: "denied",
          actorUserId: user.id,
          teamId: teamContext.teamId,
          resourceId: targetUserId,
          metadata: { reason: "self_removal_not_supported" },
        });
        return jsonError(t("errors.selfRemovalNotSupported"), 400);
      }

      const admin = createAdminClient();
      const { data: targetMembership, error: targetMembershipError } = await admin
        .from("team_memberships")
        .select("user_id,role")
        .eq("team_id", teamContext.teamId)
        .eq("user_id", targetUserId)
        .maybeSingle<TeamMembershipRow>();

      if (targetMembershipError) {
        logger.error("Failed to load target membership for removal", targetMembershipError);
        return jsonError(t("errors.unableToRemoveMember"), 500);
      }

      if (!targetMembership) {
        return jsonError(t("errors.memberNotFound"), 404);
      }

      if (teamContext.role === "admin" && targetMembership.role !== "member") {
        return jsonError(t("errors.adminRemoveLimit"), 403);
      }

      if (targetMembership.role === "owner") {
        const { count: ownerCount, error: ownerCountError } = await admin
          .from("team_memberships")
          .select("user_id", { count: "exact", head: true })
          .eq("team_id", teamContext.teamId)
          .eq("role", "owner");

        if (ownerCountError) {
          logger.error("Failed to count team owners before removal", ownerCountError);
          return jsonError(t("errors.unableToRemoveMember"), 500);
        }

        if ((ownerCount ?? 0) <= 1) {
          return jsonError(t("errors.cannotRemoveLastOwner"), 409);
        }
      }

      const { error: deleteError } = await admin
        .from("team_memberships")
        .delete()
        .eq("team_id", teamContext.teamId)
        .eq("user_id", targetUserId);

      if (deleteError) {
        logger.error("Failed to delete team membership", deleteError);
        if (deleteError.code === "P0010") {
          logAuditEvent({
            action: "team.member.remove",
            outcome: "denied",
            actorUserId: user.id,
            teamId: teamContext.teamId,
            resourceId: targetUserId,
            metadata: { reason: "last_owner_db_guard" },
          });
          return jsonError(t("errors.cannotRemoveLastOwner"), 409);
        }
        logAuditEvent({
          action: "team.member.remove",
          outcome: "failure",
          actorUserId: user.id,
          teamId: teamContext.teamId,
          resourceId: targetUserId,
          metadata: { reason: "delete_error" },
        });
        return jsonError(t("errors.unableToRemoveMember"), 500);
      }

      await Promise.all([
        invalidateCachedTeamContextForUser(targetUserId),
        invalidateCachedDashboardTeamSnapshot(teamContext.teamId),
      ]);

      let seatSynced = true;
      try {
        await syncTeamSeatQuantity(teamContext.teamId, {
          idempotencyKey: `seat-sync:remove-member:${teamContext.teamId}:${targetUserId}:${user.id}`,
        });
      } catch (error) {
        seatSynced = false;
        logger.error("Removed member but failed to sync Stripe seats", error);
        try {
          await enqueueSeatSyncRetry({
            teamId: teamContext.teamId,
            source: "team.member.remove",
            error,
          });
        } catch (retryError) {
          logger.error("Failed to enqueue seat sync retry after member removal", retryError, {
            teamId: teamContext.teamId,
          });
        }
      }

      if (!seatSynced) {
        logAuditEvent({
          action: "team.member.remove",
          outcome: "failure",
          actorUserId: user.id,
          teamId: teamContext.teamId,
          resourceId: targetUserId,
          metadata: { reason: "seat_sync_failed" },
        });
        return jsonSuccess({
          warning: t("errors.billingSyncFailedAfterRemoval"),
          memberRemoved: true,
        });
      }

      logAuditEvent({
        action: "team.member.remove",
        outcome: "success",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        resourceId: targetUserId,
        metadata: { seatSynced },
      });

      return jsonSuccess({ seatSynced: true });
    },
  });
}

export async function PATCH(request: Request, context: TeamMembersRouteContext) {
  const t = await getRouteTranslator("ApiTeamMembers", request);

  return withTeamRoute({
    request,
    allowedRoles: ["owner", "admin"],
    unauthorizedMessage: t("errors.unauthorized"),
    missingTeamMembershipMessage: t("errors.noTeamMembership"),
    forbiddenMessage: t("errors.updateRoleForbidden"),
    schema: updateMemberRoleSchema,
    invalidPayloadMessage: t("errors.invalidRolePayload"),
    payloadTooLargeMessage: t("errors.payloadTooLarge"),
    rateLimits: ({ teamId, userId }) => [
      {
        key: `team-member-role:update:${teamId}:${userId}`,
        ...RATE_LIMITS.teamMemberRoleUpdateByActor,
        message: t("errors.rateLimited"),
      },
    ],
    handler: async ({ user, teamContext, body }) => {
      const { userId: targetUserId } = await context.params;
      if (!UUID_RE.test(targetUserId)) {
        return jsonError(t("errors.invalidMemberId"), 400);
      }
      if (targetUserId === user.id) {
        return jsonError(t("errors.useOwnershipTransferForSelf"), 400);
      }

      const { role: nextRole } = body;

      const admin = createAdminClient();
      const { data: targetMembership, error: targetMembershipError } = await admin
        .from("team_memberships")
        .select("user_id,role")
        .eq("team_id", teamContext.teamId)
        .eq("user_id", targetUserId)
        .maybeSingle<TeamMembershipRow>();
      if (targetMembershipError) {
        logger.error("Failed to load target membership for role update", targetMembershipError);
        return jsonError(t("errors.unableToUpdateMemberRole"), 500);
      }
      if (!targetMembership) {
        return jsonError(t("errors.memberNotFound"), 404);
      }
      if (targetMembership.role === "owner") {
        return jsonError(t("errors.useOwnershipTransferForOwner"), 409);
      }
      if (teamContext.role === "admin" && targetMembership.role !== "member") {
        return jsonError(t("errors.adminUpdateRoleLimit"), 403);
      }

      if (targetMembership.role === nextRole) {
        return jsonSuccess({ unchanged: true });
      }

      const { error: updateError } = await admin
        .from("team_memberships")
        .update({ role: nextRole })
        .eq("team_id", teamContext.teamId)
        .eq("user_id", targetUserId);
      if (updateError) {
        logger.error("Failed to update team membership role", updateError);
        logAuditEvent({
          action: "team.member.role_update",
          outcome: "failure",
          actorUserId: user.id,
          teamId: teamContext.teamId,
          resourceId: targetUserId,
          metadata: { reason: "update_error", nextRole },
        });
        return jsonError(t("errors.unableToUpdateMemberRole"), 500);
      }

      await invalidateCachedTeamContextForUser(targetUserId);

      logAuditEvent({
        action: "team.member.role_update",
        outcome: "success",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        resourceId: targetUserId,
        metadata: { nextRole },
      });
      return jsonSuccess();
    },
  });
}
