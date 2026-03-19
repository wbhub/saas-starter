import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { getTeamContextForUser } from "@/lib/team-context";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { isValidEmail } from "@/lib/validation";
import {
  createRawInviteToken,
  getInviteExpiryIso,
  hashInviteToken,
  isInviteRole,
  normalizeEmail,
} from "@/lib/team-invites";
import { env } from "@/lib/env";
import { getResendClient, getResendFromEmail } from "@/lib/resend/server";
import { logger } from "@/lib/logger";

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
      { error: "Only team owners and admins can send invites." },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: `team-invite:create:${teamContext.teamId}`,
    ...RATE_LIMITS.teamInviteCreateByTeam,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many invites sent. Please wait and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const bodyParse = await parseJsonWithSchema(request, invitePayloadSchema);
  if (!bodyParse.success) {
    logAuditEvent({
      action: "team.invite.create",
      outcome: "failure",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: { reason: "invalid_payload" },
    });
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
  const email = normalizeEmail(bodyParse.data.email);
  const role = bodyParse.data.role;

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

  const token = createRawInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = getInviteExpiryIso();

  const cleanupError = await deleteExpiredInvitesForEmail({
    supabase,
    teamId: teamContext.teamId,
    email,
  });
  if (cleanupError) {
    logger.error("Failed to cleanup expired invites before insert", cleanupError);
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
      logger.error("Failed to cleanup expired invites before retry insert", retryCleanupError);
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
    logger.error("Failed to create team invite", insertError);
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

  const inviteUrl = `${env.NEXT_PUBLIC_APP_URL}/invite/${token}`;
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
    logger.error("Failed to send team invite email", error);
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
    inviteUrl,
  });
}
