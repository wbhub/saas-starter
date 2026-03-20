import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTeamContextForUser } from "@/lib/team-context";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { syncTeamSeatQuantity } from "@/lib/stripe/seats";
import { enqueueSeatSyncRetry } from "@/lib/stripe/seat-sync-retries";
import { logger } from "@/lib/logger";

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
  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamContext = await getTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return NextResponse.json(
      { error: "No team membership found for this account." },
      { status: 403 },
    );
  }

  if (teamContext.role !== "owner" && teamContext.role !== "admin") {
    return NextResponse.json(
      { error: "Only team owners and admins can remove members." },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: `team-member-remove:${teamContext.teamId}:${user.id}`,
    ...RATE_LIMITS.teamMemberRemoveByActor,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many member management requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const { userId: targetUserId } = await context.params;
  if (!UUID_RE.test(targetUserId)) {
    return NextResponse.json({ error: "Invalid member id." }, { status: 400 });
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
    return NextResponse.json(
      { error: "Self-removal is not supported from this action." },
      { status: 400 },
    );
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
    return NextResponse.json({ error: "Unable to remove member." }, { status: 500 });
  }

  if (!targetMembership) {
    return NextResponse.json({ error: "Member not found in this team." }, { status: 404 });
  }

  if (teamContext.role === "admin" && targetMembership.role !== "member") {
    return NextResponse.json(
      { error: "Admins can only remove members." },
      { status: 403 },
    );
  }

  if (targetMembership.role === "owner") {
    const { count: ownerCount, error: ownerCountError } = await admin
      .from("team_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("team_id", teamContext.teamId)
      .eq("role", "owner");

    if (ownerCountError) {
      logger.error("Failed to count team owners before removal", ownerCountError);
      return NextResponse.json({ error: "Unable to remove member." }, { status: 500 });
    }

    if ((ownerCount ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last team owner." },
        { status: 409 },
      );
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
      return NextResponse.json(
        { error: "Cannot remove the last team owner." },
        { status: 409 },
      );
    }
    logAuditEvent({
      action: "team.member.remove",
      outcome: "failure",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      resourceId: targetUserId,
      metadata: { reason: "delete_error" },
    });
    return NextResponse.json({ error: "Unable to remove member." }, { status: 500 });
  }

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
    return NextResponse.json(
      {
        error: "Member removed, but billing sync failed. Please retry shortly.",
        memberRemoved: true,
      },
      { status: 500 },
    );
  }

  logAuditEvent({
    action: "team.member.remove",
    outcome: "success",
    actorUserId: user.id,
    teamId: teamContext.teamId,
    resourceId: targetUserId,
    metadata: { seatSynced },
  });

  return NextResponse.json({ ok: true, seatSynced: true });
}

export async function PATCH(request: Request, context: TeamMembersRouteContext) {
  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamContext = await getTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return NextResponse.json(
      { error: "No team membership found for this account." },
      { status: 403 },
    );
  }
  if (teamContext.role !== "owner" && teamContext.role !== "admin") {
    return NextResponse.json(
      { error: "Only team owners and admins can update member roles." },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: `team-member-role:update:${teamContext.teamId}:${user.id}`,
    ...RATE_LIMITS.teamMemberRoleUpdateByActor,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many member management requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const { userId: targetUserId } = await context.params;
  if (!UUID_RE.test(targetUserId)) {
    return NextResponse.json({ error: "Invalid member id." }, { status: 400 });
  }
  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: "Use ownership transfer to change your own owner role." },
      { status: 400 },
    );
  }

  const parseResult = await parseJsonWithSchema(request, updateMemberRoleSchema);
  if (!parseResult.success) {
    if (parseResult.tooLarge) {
      return NextResponse.json({ error: "Request payload is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid role update payload." }, { status: 400 });
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
    return NextResponse.json({ error: "Unable to update member role." }, { status: 500 });
  }
  if (!targetMembership) {
    return NextResponse.json({ error: "Member not found in this team." }, { status: 404 });
  }
  if (targetMembership.role === "owner") {
    return NextResponse.json(
      { error: "Use ownership transfer to update owner role." },
      { status: 409 },
    );
  }
  if (teamContext.role === "admin" && targetMembership.role !== "member") {
    return NextResponse.json(
      { error: "Admins can only update member roles." },
      { status: 403 },
    );
  }

  if (targetMembership.role === nextRole) {
    return NextResponse.json({ ok: true, unchanged: true });
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
    return NextResponse.json({ error: "Unable to update member role." }, { status: 500 });
  }

  logAuditEvent({
    action: "team.member.role_update",
    outcome: "success",
    actorUserId: user.id,
    teamId: teamContext.teamId,
    resourceId: targetUserId,
    metadata: { nextRole },
  });
  return NextResponse.json({ ok: true });
}
