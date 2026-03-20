import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { getTeamContextForUser } from "@/lib/team-context";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { logger } from "@/lib/logger";

type InviteRouteContext = {
  params: Promise<{ inviteId: string }>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, context: InviteRouteContext) {
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
      { error: "Only team owners and admins can revoke invites." },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: `team-invite:revoke:${teamContext.teamId}:${user.id}`,
    ...RATE_LIMITS.teamInviteRevokeByActor,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many invite management requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const { inviteId } = await context.params;
  if (!UUID_RE.test(inviteId)) {
    return NextResponse.json({ error: "Invalid invite id." }, { status: 400 });
  }

  const { data: deletedInvite, error } = await supabase
    .from("team_invites")
    .delete()
    .eq("id", inviteId)
    .eq("team_id", teamContext.teamId)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    logger.error("Failed to revoke team invite", error);
    logAuditEvent({
      action: "team.invite.revoke",
      outcome: "failure",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      resourceId: inviteId,
      metadata: { reason: "delete_error" },
    });
    return NextResponse.json({ error: "Unable to revoke invite." }, { status: 500 });
  }
  if (!deletedInvite) {
    return NextResponse.json({ error: "Pending invite not found." }, { status: 404 });
  }

  logAuditEvent({
    action: "team.invite.revoke",
    outcome: "success",
    actorUserId: user.id,
    teamId: teamContext.teamId,
    resourceId: inviteId,
  });
  return NextResponse.json({ ok: true });
}
