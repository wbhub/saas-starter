import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { getAppUrl } from "@/lib/env";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { withTeamRoute } from "@/lib/http/team-route";
import { logger } from "@/lib/logger";
import {
  getResendClientIfConfigured,
  getResendFromEmailIfConfigured,
  isResendCustomEmailConfigured,
} from "@/lib/resend/server";
import { createRawInviteToken, getInviteExpiryIso, hashInviteToken } from "@/lib/team-invites";
import { getRouteTranslator } from "@/lib/i18n/locale";

type ResendInviteRouteContext = {
  params: Promise<{ inviteId: string }>;
};

type TeamInviteRow = {
  id: string;
  email: string;
  role: "admin" | "member";
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: ResendInviteRouteContext) {
  const t = await getRouteTranslator("ApiTeamInviteResend", request);

  return withTeamRoute({
    request,
    allowedRoles: ["owner", "admin"],
    unauthorizedMessage: t("errors.unauthorized"),
    missingTeamMembershipMessage: t("errors.noTeamMembership"),
    payloadTooLargeMessage: t("errors.payloadTooLarge"),
    forbiddenMessage: t("errors.forbidden"),
    rateLimits: ({ teamId, userId }) => [
      {
        key: `team-invite:resend:${teamId}:${userId}`,
        ...RATE_LIMITS.teamInviteResendByActor,
        message: t("errors.rateLimited"),
      },
    ],
    handler: async ({ supabase, user, teamContext, requestId }) => {
      const { inviteId } = await context.params;
      if (!UUID_RE.test(inviteId)) {
        return jsonError(t("errors.invalidInviteId"), 400);
      }

      const { data: invite, error: inviteError } = await supabase
        .from("team_invites")
        .select("id,email,role")
        .eq("id", inviteId)
        .eq("team_id", teamContext.teamId)
        .is("accepted_at", null)
        .maybeSingle<TeamInviteRow>();
      if (inviteError) {
        logger.error("Failed to load invite for resend", inviteError, {
          requestId,
          teamId: teamContext.teamId,
          inviteId,
        });
        return jsonError(t("errors.unableToResendInvite"), 500);
      }
      if (!invite) {
        return jsonError(t("errors.pendingInviteNotFound"), 404);
      }

      const token = createRawInviteToken();
      const tokenHash = hashInviteToken(token);
      const expiresAt = getInviteExpiryIso();
      const { error: updateError } = await supabase
        .from("team_invites")
        .update({
          token_hash: tokenHash,
          invited_by: user.id,
          expires_at: expiresAt,
        })
        .eq("id", invite.id)
        .eq("team_id", teamContext.teamId);
      if (updateError) {
        logger.error("Failed to rotate invite token for resend", updateError, {
          requestId,
          teamId: teamContext.teamId,
          inviteId,
        });
        logAuditEvent({
          action: "team.invite.resend",
          outcome: "failure",
          actorUserId: user.id,
          teamId: teamContext.teamId,
          resourceId: invite.id,
          metadata: { reason: "update_error" },
        });
        return jsonError(t("errors.unableToResendInvite"), 500);
      }

      const inviteUrl = `${getAppUrl()}/invite/${token}`;
      let emailSent = false;
      let emailFailureReason: "resend_not_configured" | "resend_unavailable" | "resend_send_failed" | null =
        null;

      if (!isResendCustomEmailConfigured()) {
        emailFailureReason = "resend_not_configured";
        logger.warn("Team invite resend email delivery disabled because Resend is not fully configured", {
          requestId,
          teamId: teamContext.teamId,
          inviteId,
        });
      } else {
        try {
          const resend = getResendClientIfConfigured();
          const fromEmail = getResendFromEmailIfConfigured();
          if (!resend || !fromEmail) {
            emailFailureReason = "resend_unavailable";
            logger.warn(
              "Team invite resend email delivery skipped because Resend became unavailable mid-request",
              {
                requestId,
                teamId: teamContext.teamId,
                inviteId,
              },
            );
          } else {
            await resend.emails.send({
              from: fromEmail,
              to: invite.email,
              subject: t("email.subject", {
                teamName: teamContext.teamName ?? t("email.defaultTeamName"),
              }),
              text: [
                t("email.line1", { teamName: teamContext.teamName ?? t("email.defaultTeamName") }),
                "",
                t("email.role", { role: invite.role }),
                t("email.acceptInvite", { inviteUrl }),
                "",
                t("email.expiresIn7Days"),
              ].join("\n"),
              replyTo: user.email ?? undefined,
            });
            emailSent = true;
            emailFailureReason = null;
          }
        } catch (error) {
          emailFailureReason = "resend_send_failed";
          logger.error("Failed to send resend invite email", error, {
            requestId,
            teamId: teamContext.teamId,
            inviteId,
          });
        }
      }

      logAuditEvent({
        action: "team.invite.resend",
        outcome: emailSent ? "success" : "failure",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        resourceId: invite.id,
        metadata: {
          emailSent,
          reason: emailSent ? undefined : "email_delivery_failed",
          emailFailureReason: emailFailureReason ?? undefined,
        },
      });
      return jsonSuccess({ emailSent });
    },
  });
}
