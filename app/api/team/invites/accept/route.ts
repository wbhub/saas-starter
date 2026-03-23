import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireJsonContentType } from "@/lib/http/content-type";
import { jsonErrorFromResponse } from "@/lib/http/api-json";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import {
  getOrCreateRequestId,
  jsonWithRequestId,
  withRequestId,
} from "@/lib/http/request-id";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { hashInviteToken } from "@/lib/team-invites";
import { syncTeamSeatQuantity } from "@/lib/stripe/seats";
import { enqueueSeatSyncRetry } from "@/lib/stripe/seat-sync-retries";
import { getTeamMaxMembers } from "@/lib/team/limits";
import { logger } from "@/lib/logger";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { invalidateCachedTeamContextForUser } from "@/lib/team-context-cache";
const acceptInvitePayloadSchema = z.object({
  token: z.string().trim().min(10).max(256),
});

type AcceptInviteRpcResult = {
  ok: boolean;
  error_code: string | null;
  team_id: string | null;
  team_name: string | null;
};

type InviteTeamLookupRow = {
  team_id: string;
};

export async function POST(request: Request) {
  const t = await getRouteTranslator("ApiTeamInviteAccept", request);
  const requestId = getOrCreateRequestId(request);
  const jsonSuccess = (
    body: Record<string, unknown> = {},
    init?: ResponseInit,
  ) => jsonWithRequestId(requestId, { ok: true as const, ...body }, init);
  const jsonError = (error: string, status: number, init?: ResponseInit) =>
    jsonWithRequestId(requestId, { ok: false as const, error }, { ...init, status });

  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return withRequestId(
      await jsonErrorFromResponse(csrfError, "Invalid request origin."),
      requestId,
    );
  }

  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) {
    return withRequestId(
      await jsonErrorFromResponse(contentTypeError, "Content-Type must be application/json."),
      requestId,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError(t("errors.unauthorized"), 401);
  }

  const bodyParse = await parseJsonWithSchema(request, acceptInvitePayloadSchema);
  if (!bodyParse.success) {
    if (bodyParse.tooLarge) {
      return jsonError(t("errors.payloadTooLarge"), 413);
    }
    return jsonError(t("errors.invalidInviteToken"), 400);
  }
  const { token } = bodyParse.data;

  const userEmail = user.email?.trim().toLowerCase();
  if (!userEmail) {
    return jsonError(t("errors.noEmailOnAccount"), 400);
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
    return jsonError(t("errors.rateLimited"), 429, {
      headers: { "Retry-After": String(retryAfterSeconds) },
    });
  }

  const admin = createAdminClient();
  const teamMaxMembers = getTeamMaxMembers();
  const nowIso = new Date().toISOString();
  const inviteLookupResult = await admin
    .from("team_invites")
    .select("team_id")
    .eq("token_hash", tokenHash)
    .is("accepted_at", null)
    .gt("expires_at", nowIso)
    .limit(1)
    .maybeSingle<InviteTeamLookupRow>();
  if (inviteLookupResult.error) {
    logger.error("Failed to resolve invite team before acceptance", inviteLookupResult.error, {
      requestId,
      userId: user.id,
    });
    return jsonError(t("errors.unableToAcceptInvite"), 500);
  }
  if (inviteLookupResult.data?.team_id) {
    const teamId = inviteLookupResult.data.team_id;
    const { count: memberCount, error: memberCountError } = await admin
      .from("team_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("team_id", teamId);
    if (memberCountError) {
      logger.error("Failed to enforce team member cap before invite acceptance", memberCountError, {
        requestId,
        teamId,
        userId: user.id,
      });
      return jsonError(t("errors.unableToAcceptInvite"), 500);
    }
    if ((memberCount ?? 0) >= teamMaxMembers) {
      return jsonError(t("errors.teamMemberLimitReached"), 409);
    }
  }

  const { data, error: rpcError } = await admin.rpc("accept_team_invite_atomic", {
    p_token_hash: tokenHash,
    p_user_id: user.id,
    p_user_email: userEmail,
  });

  if (rpcError) {
    logger.error("Failed to accept invite atomically", rpcError, { requestId, userId: user.id });
    logAuditEvent({
      action: "team.invite.accept",
      outcome: "failure",
      actorUserId: user.id,
      metadata: { reason: "rpc_error" },
    });
    return jsonError(t("errors.unableToAcceptInvite"), 500);
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
      return jsonError(t("errors.inviteNotFound"), 404);
    }
    if (code === "already_accepted") {
      return jsonError(t("errors.inviteAlreadyAccepted"), 409);
    }
    if (code === "expired") {
      return jsonError(t("errors.inviteExpired"), 410);
    }
    if (code === "email_mismatch") {
      return jsonError(t("errors.inviteEmailMismatch"), 403);
    }
    return jsonError(t("errors.unableToAcceptInvite"), 500);
  }

  await invalidateCachedTeamContextForUser(user.id);

  let seatSynced = true;
  if (rpcRow.team_id) {
    try {
      await syncTeamSeatQuantity(rpcRow.team_id, {
        idempotencyKey: `seat-sync:accept-invite:${rpcRow.team_id}:${user.id}`,
      });
    } catch (error) {
      seatSynced = false;
      logger.error("Accepted invite but failed to sync Stripe seat quantity", error, {
        requestId,
        teamId: rpcRow.team_id,
        userId: user.id,
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
          userId: user.id,
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
    return jsonSuccess({
      warning: t("errors.billingSyncFailedAfterAccept"),
      inviteAccepted: true,
      teamName: rpcRow.team_name ?? t("defaults.teamName"),
    });
  }

  logAuditEvent({
    action: "team.invite.accept",
    outcome: "success",
    actorUserId: user.id,
    teamId: rpcRow.team_id,
    metadata: { seatSynced: true },
  });

  return jsonSuccess({
    teamName: rpcRow.team_name ?? t("defaults.teamName"),
  });
}
