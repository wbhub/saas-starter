import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireJsonContentType } from "@/lib/http/content-type";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { hashInviteToken } from "@/lib/team-invites";
import { syncTeamSeatQuantity } from "@/lib/stripe/seats";
import { enqueueSeatSyncRetry } from "@/lib/stripe/seat-sync-retries";
import { logger } from "@/lib/logger";
const acceptInvitePayloadSchema = z.object({
  token: z.string().trim().min(10).max(256),
});

type AcceptInviteRpcResult = {
  ok: boolean;
  error_code: string | null;
  team_id: string | null;
  team_name: string | null;
};

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

  const bodyParse = await parseJsonWithSchema(request, acceptInvitePayloadSchema);
  if (!bodyParse.success) {
    return NextResponse.json({ error: "Invalid invite token." }, { status: 400 });
  }
  const { token } = bodyParse.data;

  const userEmail = user.email?.trim().toLowerCase();
  if (!userEmail) {
    return NextResponse.json(
      { error: "No email found on this account." },
      { status: 400 },
    );
  }

  const tokenHash = hashInviteToken(token);

  const clientId = getClientRateLimitIdentifier(request);
  const [userRateLimit, clientRateLimit] = await Promise.all([
    checkRateLimit({
      key: `team-invite:accept:user:${user.id}`,
      ...RATE_LIMITS.teamInviteAcceptByUser,
    }),
    checkRateLimit({
      key: `team-invite:accept:${clientId.keyType}:${clientId.value}`,
      ...RATE_LIMITS.teamInviteAcceptByClient,
    }),
  ]);
  if (!userRateLimit.allowed || !clientRateLimit.allowed) {
    const retryAfterSeconds = Math.max(
      userRateLimit.retryAfterSeconds,
      clientRateLimit.retryAfterSeconds,
    );
    return NextResponse.json(
      { error: "Too many invite acceptance attempts. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      },
    );
  }

  const admin = createAdminClient();
  const { data, error: rpcError } = await admin.rpc("accept_team_invite_atomic", {
    p_token_hash: tokenHash,
    p_user_id: user.id,
    p_user_email: userEmail,
  });

  if (rpcError) {
    logger.error("Failed to accept invite atomically", rpcError);
    logAuditEvent({
      action: "team.invite.accept",
      outcome: "failure",
      actorUserId: user.id,
      metadata: { reason: "rpc_error" },
    });
    return NextResponse.json({ error: "Unable to accept invite." }, { status: 500 });
  }

  const rpcRow = (Array.isArray(data) ? data[0] : data) as AcceptInviteRpcResult | null;
  if (!rpcRow || !rpcRow.ok) {
    const code = rpcRow?.error_code;
    if (code === "not_found") {
      logAuditEvent({
        action: "team.invite.accept",
        outcome: "denied",
        actorUserId: user.id,
        metadata: { reason: code },
      });
      return NextResponse.json({ error: "Invite not found." }, { status: 404 });
    }
    if (code === "already_accepted") {
      return NextResponse.json({ error: "Invite has already been accepted." }, { status: 409 });
    }
    if (code === "expired") {
      return NextResponse.json({ error: "Invite has expired." }, { status: 410 });
    }
    if (code === "email_mismatch") {
      return NextResponse.json(
        { error: "This invite was sent to a different email address." },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Unable to accept invite." }, { status: 500 });
  }

  let seatSynced = true;
  if (rpcRow.team_id) {
    try {
      await syncTeamSeatQuantity(rpcRow.team_id, {
        idempotencyKey: `seat-sync:accept-invite:${rpcRow.team_id}:${user.id}`,
      });
    } catch (error) {
      seatSynced = false;
      logger.error("Accepted invite but failed to sync Stripe seat quantity", error);
      try {
        await enqueueSeatSyncRetry({
          teamId: rpcRow.team_id,
          source: "team.invite.accept",
          error,
        });
      } catch (retryError) {
        logger.error("Failed to enqueue seat sync retry after invite acceptance", retryError, {
          teamId: rpcRow.team_id,
        });
      }
    }
  }

  if (!seatSynced) {
    logAuditEvent({
      action: "team.invite.accept",
      outcome: "failure",
      actorUserId: user.id,
      teamId: rpcRow.team_id,
      metadata: { reason: "seat_sync_failed" },
    });
    return NextResponse.json(
      {
        error: "Invite accepted, but billing sync failed. Please retry shortly.",
        inviteAccepted: true,
        teamName: rpcRow.team_name ?? "Team",
      },
      { status: 500 },
    );
  }

  logAuditEvent({
    action: "team.invite.accept",
    outcome: "success",
    actorUserId: user.id,
    teamId: rpcRow.team_id,
    metadata: { seatSynced: true },
  });

  return NextResponse.json({
    ok: true,
    teamName: rpcRow.team_name ?? "Team",
  });
}
