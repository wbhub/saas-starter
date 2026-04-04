import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { jsonError, jsonSuccess } from "@/lib/http/api-json";
import { withTeamRoute } from "@/lib/http/team-route";
import { z } from "@/lib/http/request-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import { isValidEmail } from "@/lib/validation";
import {
  createRawInviteToken,
  getInviteExpiryIso,
  hashInviteToken,
  isInviteRole,
  normalizeEmail,
} from "@/lib/team-invites";
import { getAppUrl } from "@/lib/env";
import {
  getResendClientIfConfigured,
  getResendFromEmailIfConfigured,
  isResendCustomEmailConfigured,
  sendResendEmail,
} from "@/lib/resend/server";
import { logger } from "@/lib/logger";
import { getTeamMaxMembers } from "@/lib/team/limits";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";
import { isTriggerConfigured } from "@/lib/trigger/config";
import { triggerSendEmailTask } from "@/lib/trigger/dispatch";

const invitePayloadSchema = z.object({
  email: z.string().trim(),
  role: z.string().trim().toLowerCase(),
});

async function deleteExpiredInvitesForEmail({
  supabase,
  teamId,
  email,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  teamId: string;
  email: string;
}) {
  const { error } = await supabase
    .from("team_invites")
    .delete()
    .eq("team_id", teamId)
    .eq("email", email)
    .is("accepted_at", null)
    .lt("expires_at", new Date().toISOString());

  return error;
}

export async function POST(request: Request) {
  const t = await getRouteTranslator("ApiTeamInvites", request);

  return withTeamRoute({
    request,
    allowedRoles: ["owner", "admin"],
    unauthorizedMessage: t("errors.unauthorized"),
    missingTeamMembershipMessage: t("errors.noTeamMembership"),
    payloadTooLargeMessage: t("errors.payloadTooLarge"),
    forbiddenMessage: t("errors.forbidden"),
    requireJsonBody: true,
    schema: invitePayloadSchema,
    invalidPayloadMessage: t("errors.invalidPayload"),
    onInvalidPayload: ({ userId, teamId }) => {
      logAuditEvent({
        action: "team.invite.create",
        outcome: "failure",
        actorUserId: userId,
        teamId,
        metadata: { reason: "invalid_payload" },
      });
    },
    rateLimits: ({ teamId }) => [
      {
        key: `team-invite:create:${teamId}`,
        ...RATE_LIMITS.teamInviteCreateByTeam,
        message: t("errors.rateLimited"),
      },
    ],
    handler: async ({ supabase, user, teamContext, body, requestId }) => {
      const email = normalizeEmail(body.email);
      const role = body.role;

      if (!isValidEmail(email)) {
        return jsonError(t("errors.invalidEmail"), 400);
      }

      if (!isInviteRole(role)) {
        return jsonError(t("errors.invalidRole"), 400);
      }

      if (role === "owner" && teamContext.role !== "owner") {
        return jsonError(t("errors.onlyOwnerCanInviteOwner"), 403);
      }

      if (user.email && normalizeEmail(user.email) === email) {
        return jsonError(t("errors.alreadyInTeam"), 409);
      }

      const { data: liveSubscription, error: liveSubscriptionError } = await supabase
        .from("subscriptions")
        .select("stripe_subscription_id")
        .eq("team_id", teamContext.teamId)
        .in("status", LIVE_SUBSCRIPTION_STATUSES)
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle<{ stripe_subscription_id: string | null }>();
      if (liveSubscriptionError) {
        logger.error(
          "Failed to verify live subscription before invite creation",
          liveSubscriptionError,
          {
            requestId,
            teamId: teamContext.teamId,
          },
        );
        return jsonError(t("errors.unableToCreateInvite"), 500);
      }
      if (!liveSubscription?.stripe_subscription_id) {
        return jsonError(t("errors.paidPlanRequired"), 402);
      }

      const teamMaxMembers = getTeamMaxMembers();

      const token = createRawInviteToken();
      const tokenHash = hashInviteToken(token);
      const expiresAt = getInviteExpiryIso();

      const cleanupError = await deleteExpiredInvitesForEmail({
        supabase,
        teamId: teamContext.teamId,
        email,
      });
      if (cleanupError) {
        logger.error("Failed to cleanup expired invites before insert", cleanupError, {
          requestId,
          teamId: teamContext.teamId,
        });
      }

      const admin = createAdminClient();
      const { data: rpcResult, error: rpcError } = await admin.rpc("create_team_invite_atomic", {
        p_team_id: teamContext.teamId,
        p_email: email,
        p_role: role,
        p_token_hash: tokenHash,
        p_invited_by: user.id,
        p_expires_at: expiresAt,
        p_max_members: teamMaxMembers,
      });

      if (rpcError) {
        logger.error("Failed to create team invite", rpcError, {
          requestId,
          teamId: teamContext.teamId,
        });
        logAuditEvent({
          action: "team.invite.create",
          outcome: "failure",
          actorUserId: user.id,
          teamId: teamContext.teamId,
          metadata: { reason: "rpc_error", email },
        });
        return jsonError(t("errors.unableToCreateInvite"), 500);
      }

      const rpcRow = (Array.isArray(rpcResult) ? rpcResult[0] : rpcResult) as {
        ok: boolean;
        error_code: string | null;
      } | null;

      if (!rpcRow?.ok) {
        const code = rpcRow?.error_code;
        if (code === "team_full") {
          return jsonError(t("errors.teamMemberLimitReached"), 409);
        }
        if (code === "duplicate_pending_invite") {
          logAuditEvent({
            action: "team.invite.create",
            outcome: "failure",
            actorUserId: user.id,
            teamId: teamContext.teamId,
            metadata: { reason: "duplicate_pending_invite", email },
          });
          return jsonError(t("errors.pendingInviteExists"), 409);
        }
        return jsonError(t("errors.unableToCreateInvite"), 500);
      }

      const inviteUrl = `${getAppUrl()}/invite/${token}`;
      let emailSent = false;
      let emailFailureReason:
        | "resend_not_configured"
        | "resend_unavailable"
        | "resend_send_failed"
        | null = null;

      if (!isResendCustomEmailConfigured()) {
        emailFailureReason = "resend_not_configured";
        logger.warn("Team invite email delivery disabled because Resend is not fully configured", {
          requestId,
          teamId: teamContext.teamId,
        });
      } else {
        try {
          const resend = getResendClientIfConfigured();
          const fromEmail = getResendFromEmailIfConfigured();
          if (!resend || !fromEmail) {
            emailFailureReason = "resend_unavailable";
            logger.warn(
              "Team invite email delivery skipped because Resend became unavailable mid-request",
              {
                requestId,
                teamId: teamContext.teamId,
              },
            );
          } else {
            const emailPayload = {
              from: fromEmail,
              to: email,
              subject: t("email.subject", {
                teamName: teamContext.teamName ?? t("email.defaultTeamName"),
              }),
              text: [
                t("email.line1", { teamName: teamContext.teamName ?? t("email.defaultTeamName") }),
                "",
                t("email.role", { role }),
                t("email.acceptInvite", { inviteUrl }),
                "",
                t("email.expiresIn7Days"),
              ].join("\n"),
              replyTo: user.email ?? undefined,
            };

            if (isTriggerConfigured()) {
              const triggered = await triggerSendEmailTask(emailPayload);
              if (!triggered) {
                logger.warn(
                  "Team invite Trigger enqueue failed, falling back to inline Resend send",
                  {
                    requestId,
                    teamId: teamContext.teamId,
                  },
                );
                await sendResendEmail(emailPayload);
              }
            } else {
              await sendResendEmail(emailPayload);
            }

            emailSent = true;
            emailFailureReason = null;
          }
        } catch (error) {
          emailFailureReason = "resend_send_failed";
          logger.error("Failed to send team invite email", error, {
            requestId,
            teamId: teamContext.teamId,
          });
        }
      }

      logAuditEvent({
        action: "team.invite.create",
        outcome: "success",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        metadata: { email, role, emailSent, emailFailureReason: emailFailureReason ?? undefined },
      });

      return jsonSuccess({ emailSent });
    },
  });
}
