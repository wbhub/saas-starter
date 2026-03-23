import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { jsonError, jsonErrorFromResponse, jsonSuccess } from "@/lib/http/api-json";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCachedTeamContextForUser,
  invalidateCachedTeamContextForUser,
} from "@/lib/team-context-cache";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const updateMemberRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

export async function DELETE(request: Request, context: TeamMembersRouteContext) {
  const t = await getRouteTranslator("ApiTeamMembers", request);
  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return jsonErrorFromResponse(csrfError, "Invalid request origin.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError(t("errors.unauthorized"), 401);
  }

  const teamContext = await getCachedTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return jsonError(t("errors.noTeamMembership"), 403);
  }

  if (teamContext.role !== "owner" && teamContext.role !== "admin") {
    return jsonError(t("errors.removeForbidden"), 403);
  }

  const rateLimit = await checkRateLimit({
    key: `team-member-remove:${teamContext.teamId}:${user.id}`,
    ...RATE_LIMITS.teamMemberRemoveByActor,
  });
  if (!rateLimit.allowed) {
    return jsonError(t("errors.rateLimited"), 429, {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

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

  await invalidateCachedTeamContextForUser(targetUserId);

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
}

export async function PATCH(request: Request, context: TeamMembersRouteContext) {
  const t = await getRouteTranslator("ApiTeamMembers", request);
  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return jsonErrorFromResponse(csrfError, "Invalid request origin.");
  }

  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) {
    return jsonErrorFromResponse(contentTypeError, "Content-Type must be application/json.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError(t("errors.unauthorized"), 401);
  }

  const teamContext = await getCachedTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return jsonError(t("errors.noTeamMembership"), 403);
  }
  if (teamContext.role !== "owner" && teamContext.role !== "admin") {
    return jsonError(t("errors.updateRoleForbidden"), 403);
  }

  const rateLimit = await checkRateLimit({
    key: `team-member-role:update:${teamContext.teamId}:${user.id}`,
    ...RATE_LIMITS.teamMemberRoleUpdateByActor,
  });
  if (!rateLimit.allowed) {
    return jsonError(t("errors.rateLimited"), 429, {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const { userId: targetUserId } = await context.params;
  if (!UUID_RE.test(targetUserId)) {
    return jsonError(t("errors.invalidMemberId"), 400);
  }
  if (targetUserId === user.id) {
    return jsonError(t("errors.useOwnershipTransferForSelf"), 400);
  }

  const parseResult = await parseJsonWithSchema(request, updateMemberRoleSchema);
  if (!parseResult.success) {
    if (parseResult.tooLarge) {
      return jsonError(t("errors.payloadTooLarge"), 413);
    }
    return jsonError(t("errors.invalidRolePayload"), 400);
  }
  const { role: nextRole } = parseResult.data;

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
}
