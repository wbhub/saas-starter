import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { withTeamRoute } from "@/lib/http/team-route";
import { z } from "@/lib/http/request-validation";
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
import { getResendClient, getResendFromEmail } from "@/lib/resend/server";
import { logger } from "@/lib/logger";
import { getTeamMaxMembers } from "@/lib/team/limits";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { LIVE_SUBSCRIPTION_STATUSES } from "@/lib/stripe/plans";

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
        return NextResponse.json({ error: t("errors.invalidEmail") }, { status: 400 });
      }

      if (!isInviteRole(role)) {
        return NextResponse.json({ error: t("errors.invalidRole") }, { status: 400 });
      }

      if (user.email && normalizeEmail(user.email) === email) {
        return NextResponse.json(
          { error: t("errors.alreadyInTeam") },
          { status: 409 },
        );
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
        return NextResponse.json(
          { error: t("errors.unableToCreateInvite") },
          { status: 500 },
        );
      }
      if (!liveSubscription?.stripe_subscription_id) {
        return NextResponse.json(
          { error: t("errors.paidPlanRequired") },
          { status: 402 },
        );
      }

      const teamMaxMembers = getTeamMaxMembers();
      const nowIso = new Date().toISOString();
      const [memberCountResult, pendingInviteCountResult] = await Promise.all([
        supabase
          .from("team_memberships")
          .select("user_id", { count: "exact", head: true })
          .eq("team_id", teamContext.teamId),
        supabase
          .from("team_invites")
          .select("id", { count: "exact", head: true })
          .eq("team_id", teamContext.teamId)
          .is("accepted_at", null)
          .gt("expires_at", nowIso),
      ]);
      if (memberCountResult.error || pendingInviteCountResult.error) {
        logger.error(
          "Failed to enforce team member cap before invite creation",
          memberCountResult.error ?? pendingInviteCountResult.error,
          {
            requestId,
            teamId: teamContext.teamId,
          },
        );
        return NextResponse.json(
          { error: t("errors.unableToCreateInvite") },
          { status: 500 },
        );
      }

      const projectedTeamSize =
        (memberCountResult.count ?? 0) + (pendingInviteCountResult.count ?? 0);
      if (projectedTeamSize >= teamMaxMembers) {
        return NextResponse.json(
          { error: t("errors.teamMemberLimitReached") },
          { status: 409 },
        );
      }

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

      const inviteInsert = {
        team_id: teamContext.teamId,
        email,
        role,
        token_hash: tokenHash,
        invited_by: user.id,
        expires_at: expiresAt,
      };
      let { error: insertError } = await supabase.from("team_invites").insert(inviteInsert);

      if (insertError?.code === "23505") {
        // Retry once after cleanup to handle races where a stale invite row causes
        // a transient unique-constraint conflict.
        const retryCleanupError = await deleteExpiredInvitesForEmail({
          supabase,
          teamId: teamContext.teamId,
          email,
        });
        if (retryCleanupError) {
          logger.error("Failed to cleanup expired invites before retry insert", retryCleanupError, {
            requestId,
            teamId: teamContext.teamId,
          });
        }
        const retryInsertResult = await supabase.from("team_invites").insert(inviteInsert);
        insertError = retryInsertResult.error;
      }

      if (insertError) {
        if (insertError.code === "23505") {
          logAuditEvent({
            action: "team.invite.create",
            outcome: "failure",
            actorUserId: user.id,
            teamId: teamContext.teamId,
            metadata: { reason: "duplicate_pending_invite", email },
          });
          return NextResponse.json(
            { error: t("errors.pendingInviteExists") },
            { status: 409 },
          );
        }
        logger.error("Failed to create team invite", insertError, {
          requestId,
          teamId: teamContext.teamId,
        });
        logAuditEvent({
          action: "team.invite.create",
          outcome: "failure",
          actorUserId: user.id,
          teamId: teamContext.teamId,
          metadata: { reason: "insert_error", email },
        });
        return NextResponse.json(
          { error: t("errors.unableToCreateInvite") },
          { status: 500 },
        );
      }

      const inviteUrl = `${getAppUrl()}/invite/${token}`;
      let emailSent = false;

      try {
        const resend = getResendClient();
        await resend.emails.send({
          from: getResendFromEmail(),
          to: email,
          subject: t("email.subject", { teamName: teamContext.teamName ?? t("email.defaultTeamName") }),
          text: [
            t("email.line1", { teamName: teamContext.teamName ?? t("email.defaultTeamName") }),
            "",
            t("email.role", { role }),
            t("email.acceptInvite", { inviteUrl }),
            "",
            t("email.expiresIn7Days"),
          ].join("\n"),
          replyTo: user.email ?? undefined,
        });
        emailSent = true;
      } catch (error) {
        logger.error("Failed to send team invite email", error, {
          requestId,
          teamId: teamContext.teamId,
        });
      }

      logAuditEvent({
        action: "team.invite.create",
        outcome: "success",
        actorUserId: user.id,
        teamId: teamContext.teamId,
        metadata: { email, role, emailSent },
      });

      return NextResponse.json({
        ok: true,
        emailSent,
      });
    },
  });
}
