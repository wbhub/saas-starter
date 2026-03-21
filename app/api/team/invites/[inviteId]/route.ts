import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { withTeamRoute } from "@/lib/http/team-route";
import { logger } from "@/lib/logger";
import { getRouteTranslator } from "@/lib/i18n/locale";

type InviteRouteContext = {
  params: Promise<{ inviteId: string }>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, context: InviteRouteContext) {
  const t = await getRouteTranslator("ApiTeamInviteRevoke", request);

  return withTeamRoute({
    request,
    allowedRoles: ["owner", "admin"],
    unauthorizedMessage: t("errors.unauthorized"),
    missingTeamMembershipMessage: t("errors.noTeamMembership"),
    forbiddenMessage: t("errors.forbidden"),
    rateLimits: ({ teamId, userId }) => [
      {
        key: `team-invite:revoke:${teamId}:${userId}`,
        ...RATE_LIMITS.teamInviteRevokeByActor,
        message: t("errors.rateLimited"),
      },
    ],
    handler: async ({ supabase, user, teamContext, requestId }) => {
      const { inviteId } = await context.params;
      if (!UUID_RE.test(inviteId)) {
        return NextResponse.json({ error: t("errors.invalidInviteId") }, { status: 400 });
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
        logger.error("Failed to revoke team invite", error, {
          requestId,
          teamId: teamContext.teamId,
          inviteId,
        });
        logAuditEvent({
          action: "team.invite.revoke",
          outcome: "failure",
          actorUserId: user.id,
          teamId: teamContext.teamId,
          resourceId: inviteId,
          metadata: { reason: "delete_error" },
        });
        return NextResponse.json({ error: t("errors.unableToRevokeInvite") }, { status: 500 });
      }
      if (!deletedInvite) {
        return NextResponse.json({ error: t("errors.pendingInviteNotFound") }, { status: 404 });
      }

      logAuditEvent({
        action: "team.invite.revoke",
        outcome: "success",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        resourceId: inviteId,
      });
      return NextResponse.json({ ok: true });
    },
  });
}
