import { logAuditEvent } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashInviteToken } from "@/lib/team-invites";
import { syncTeamSeatQuantity } from "@/lib/stripe/seats";
import { enqueueSeatSyncRetry } from "@/lib/stripe/seat-sync-retries";
import { getTeamMaxMembers } from "@/lib/team/limits";
import { logger } from "@/lib/logger";
import { invalidateCachedTeamContextForUser } from "@/lib/team-context-cache";
import { invalidateCachedDashboardTeamSnapshot } from "@/lib/dashboard/team-snapshot-cache";

type AcceptInviteRpcResult = {
  ok: boolean;
  error_code: string | null;
  team_id: string | null;
  team_name: string | null;
};

export type AcceptInviteErrorCode =
  | "no_email"
  | "not_found"
  | "already_accepted"
  | "expired"
  | "email_mismatch"
  | "team_full"
  | "rpc_error"
  | "unknown";

export type AcceptInviteResult =
  | { ok: true; teamName: string; warning?: string }
  | { ok: false; errorCode: AcceptInviteErrorCode };

export async function acceptTeamInvite(params: {
  token: string;
  userId: string;
  userEmail: string | undefined;
  requestId?: string;
}): Promise<AcceptInviteResult> {
  const { token, userId, userEmail: rawEmail, requestId } = params;

  const userEmail = rawEmail?.trim().toLowerCase();
  if (!userEmail) {
    return { ok: false, errorCode: "no_email" };
  }

  const tokenHash = hashInviteToken(token);
  const admin = createAdminClient();
  const teamMaxMembers = getTeamMaxMembers();

  const { data, error: rpcError } = await admin.rpc("accept_team_invite_atomic", {
    p_token_hash: tokenHash,
    p_user_id: userId,
    p_user_email: userEmail,
    p_max_members: teamMaxMembers,
  });

  if (rpcError) {
    logger.error("Failed to accept invite atomically", rpcError, {
      requestId,
      userId,
    });
    logAuditEvent({
      action: "team.invite.accept",
      outcome: "failure",
      actorUserId: userId,
      metadata: { reason: "rpc_error" },
    });
    return { ok: false, errorCode: "rpc_error" };
  }

  const rpcRow = (Array.isArray(data) ? data[0] : data) as AcceptInviteRpcResult | null;
  if (!rpcRow || !rpcRow.ok) {
    const code = rpcRow?.error_code;
    const knownCodes: AcceptInviteErrorCode[] = [
      "not_found",
      "already_accepted",
      "expired",
      "email_mismatch",
      "team_full",
    ];
    const errorCode = knownCodes.includes(code as AcceptInviteErrorCode)
      ? (code as AcceptInviteErrorCode)
      : "unknown";

    if (code === "not_found") {
      logAuditEvent({
        action: "team.invite.accept",
        outcome: "denied",
        actorUserId: userId,
        metadata: { reason: code },
      });
    }

    return { ok: false, errorCode };
  }

  await Promise.all([
    invalidateCachedTeamContextForUser(userId),
    rpcRow.team_id ? invalidateCachedDashboardTeamSnapshot(rpcRow.team_id) : Promise.resolve(),
  ]);

  let seatSynced = true;
  if (rpcRow.team_id) {
    try {
      await syncTeamSeatQuantity(rpcRow.team_id, {
        idempotencyKey: `seat-sync:accept-invite:${rpcRow.team_id}:${userId}`,
      });
    } catch (error) {
      seatSynced = false;
      logger.error("Accepted invite but failed to sync Stripe seat quantity", error, {
        requestId,
        teamId: rpcRow.team_id,
        userId,
      });
      try {
        await enqueueSeatSyncRetry({
          teamId: rpcRow.team_id,
          source: "team.invite.accept",
          error,
        });
      } catch (retryError) {
        logger.error("Failed to enqueue seat sync retry after invite acceptance", retryError, {
          requestId,
          teamId: rpcRow.team_id,
          userId,
        });
      }
    }
  }

  if (!seatSynced) {
    logAuditEvent({
      action: "team.invite.accept",
      outcome: "failure",
      actorUserId: userId,
      teamId: rpcRow.team_id,
      metadata: { reason: "seat_sync_failed" },
    });
    return {
      ok: true,
      warning: "seat_sync_failed",
      teamName: rpcRow.team_name ?? "Team",
    };
  }

  logAuditEvent({
    action: "team.invite.accept",
    outcome: "success",
    actorUserId: userId,
    teamId: rpcRow.team_id,
    metadata: { seatSynced: true },
  });

  return {
    ok: true,
    teamName: rpcRow.team_name ?? "Team",
  };
}
