import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { withTeamRoute } from "@/lib/http/team-route";
import { z } from "@/lib/http/request-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateCachedTeamContextForUser } from "@/lib/team-context-cache";
import { logger } from "@/lib/logger";
import { getRouteTranslator } from "@/lib/i18n/locale";

const transferOwnershipSchema = z.object({
  nextOwnerUserId: z.string().uuid(),
});

type TransferOwnershipRpcResult = {
  ok: boolean;
  error_code: string | null;
};

export async function POST(request: Request) {
  const t = await getRouteTranslator("ApiTeamOwnershipTransfer", request);

  return withTeamRoute({
    request,
    allowedRoles: ["owner"],
    unauthorizedMessage: t("errors.unauthorized"),
    missingTeamMembershipMessage: t("errors.noTeamMembership"),
    forbiddenMessage: t("errors.forbidden"),
    schema: transferOwnershipSchema,
    invalidPayloadMessage: t("errors.invalidPayload"),
    payloadTooLargeMessage: t("errors.payloadTooLarge"),
    rateLimits: ({ teamId, userId }) => [
      {
        key: `team-ownership:transfer:${teamId}:${userId}`,
        ...RATE_LIMITS.teamOwnershipTransferByActor,
        message: t("errors.rateLimited"),
      },
    ],
    handler: async ({ user, teamContext, body }) => {
      const { nextOwnerUserId } = body;
      if (nextOwnerUserId === user.id) {
        return jsonError(t("errors.alreadyOwner"), 409);
      }

      const admin = createAdminClient();
      const { data: rpcData, error: rpcError } = await admin.rpc("transfer_team_ownership_atomic", {
        p_team_id: teamContext.teamId,
        p_current_owner_user_id: user.id,
        p_next_owner_user_id: nextOwnerUserId,
      });
      if (rpcError) {
        logger.error("Failed to transfer team ownership atomically", rpcError);
        logAuditEvent({
          action: "team.ownership.transfer",
          outcome: "failure",
          actorUserId: user.id,
          teamId: teamContext.teamId,
          resourceId: nextOwnerUserId,
          metadata: { reason: "rpc_error" },
        });
        return jsonError(t("errors.unableToTransfer"), 500);
      }

      const rpcRow = (
        Array.isArray(rpcData) ? rpcData[0] : rpcData
      ) as TransferOwnershipRpcResult | null;
      if (!rpcRow || !rpcRow.ok) {
        const code = rpcRow?.error_code;
        if (code === "target_not_found") {
          return jsonError(t("errors.targetNotFound"), 404);
        }
        if (code === "target_already_owner") {
          return jsonError(t("errors.targetAlreadyOwner"), 409);
        }
        if (code === "not_current_owner") {
          return jsonError(t("errors.forbidden"), 403);
        }
        if (code === "same_user") {
          return jsonError(t("errors.alreadyOwner"), 409);
        }

        logAuditEvent({
          action: "team.ownership.transfer",
          outcome: "failure",
          actorUserId: user.id,
          teamId: teamContext.teamId,
          resourceId: nextOwnerUserId,
          metadata: { reason: code ?? "unknown" },
        });
        return jsonError(t("errors.unableToTransfer"), 500);
      }

      await Promise.all([
        invalidateCachedTeamContextForUser(user.id),
        invalidateCachedTeamContextForUser(nextOwnerUserId),
      ]);

      logAuditEvent({
        action: "team.ownership.transfer",
        outcome: "success",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        resourceId: nextOwnerUserId,
      });
      return jsonSuccess();
    },
  });
}
