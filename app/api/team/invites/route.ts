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
  return withTeamRoute({
    request,
    allowedRoles: ["owner", "admin"],
    forbiddenMessage: "Only team owners and admins can send invites.",
    requireJsonBody: true,
    schema: invitePayloadSchema,
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
        message: "Too many invites sent. Please wait and try again.",
      },
    ],
    handler: async ({ supabase, user, teamContext, body, requestId }) => {
      const email = normalizeEmail(body.email);
      const role = body.role;

      if (!isValidEmail(email)) {
        return NextResponse.json({ error: "Please provide a valid email." }, { status: 400 });
      }

      if (!isInviteRole(role)) {
        return NextResponse.json({ error: "Role must be admin or member." }, { status: 400 });
      }

      if (user.email && normalizeEmail(user.email) === email) {
        return NextResponse.json(
          { error: "You are already part of this team." },
          { status: 409 },
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
          { error: "Unable to create invite right now." },
          { status: 500 },
        );
      }

      const projectedTeamSize =
        (memberCountResult.count ?? 0) + (pendingInviteCountResult.count ?? 0);
      if (projectedTeamSize >= teamMaxMembers) {
        return NextResponse.json(
          { error: "Team member limit reached. Revoke pending invites or remove members first." },
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
            { error: "A pending invite already exists for this email." },
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
          { error: "Unable to create invite right now." },
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
          subject: `You're invited to join ${teamContext.teamName ?? "a team"}`,
          text: [
            `You've been invited to join ${teamContext.teamName ?? "a team"} on SaaS Starter.`,
            "",
            `Role: ${role}`,
            `Accept invite: ${inviteUrl}`,
            "",
            "This invite expires in 7 days.",
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
