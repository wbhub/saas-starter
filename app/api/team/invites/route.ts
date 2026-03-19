import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTeamContextForUser } from "@/lib/team-context";
import { requireJsonContentType } from "@/lib/http/content-type";
import { checkRateLimit } from "@/lib/security/rate-limit";
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

type InvitePayload = {
  email?: string;
  role?: string;
};

export async function POST(request: Request) {
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
    limit: 20,
    windowMs: 60 * 60 * 1000,
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

  const body = (await request.json().catch(() => null)) as InvitePayload | null;
  const email = normalizeEmail(body?.email ?? "");
  const role = (body?.role ?? "").trim().toLowerCase();

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

  // Clear expired pending invites for this team/email before inserting a fresh one.
  await supabase
    .from("team_invites")
    .delete()
    .eq("team_id", teamContext.teamId)
    .eq("email", email)
    .is("accepted_at", null)
    .lt("expires_at", new Date().toISOString());

  const { error: insertError } = await supabase.from("team_invites").insert({
    team_id: teamContext.teamId,
    email,
    role,
    token_hash: tokenHash,
    invited_by: user.id,
    expires_at: expiresAt,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "A pending invite already exists for this email." },
        { status: 409 },
      );
    }
    logger.error("Failed to create team invite", insertError);
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

  return NextResponse.json({
    ok: true,
    emailSent,
    inviteUrl,
  });
}
