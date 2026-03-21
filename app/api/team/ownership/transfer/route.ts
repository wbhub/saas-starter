import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCachedTeamContextForUser,
  invalidateCachedTeamContextForUser,
} from "@/lib/team-context-cache";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { logger } from "@/lib/logger";
import { getRouteTranslator } from "@/lib/i18n/locale";

const transferOwnershipSchema = z.object({
  nextOwnerUserId: z.string().uuid(),
});

type TransferOwnershipRpcResult = {
  ok: boolean;
  error_code: string | null;
};

export async function POST(request: Request) {
  const t = await getRouteTranslator("ApiTeamOwnershipTransfer", request);
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
    return NextResponse.json({ error: t("errors.unauthorized") }, { status: 401 });
  }

  const teamContext = await getCachedTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return NextResponse.json(
      { error: t("errors.noTeamMembership") },
      { status: 403 },
    );
  }

  if (teamContext.role !== "owner") {
    return NextResponse.json(
      { error: t("errors.forbidden") },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: `team-ownership:transfer:${teamContext.teamId}:${user.id}`,
    ...RATE_LIMITS.teamOwnershipTransferByActor,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: t("errors.rateLimited") },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const parseResult = await parseJsonWithSchema(request, transferOwnershipSchema);
  if (!parseResult.success) {
    if (parseResult.tooLarge) {
      return NextResponse.json({ error: t("errors.payloadTooLarge") }, { status: 413 });
    }
    return NextResponse.json({ error: t("errors.invalidPayload") }, { status: 400 });
  }

  const { nextOwnerUserId } = parseResult.data;
  if (nextOwnerUserId === user.id) {
    return NextResponse.json(
      { error: t("errors.alreadyOwner") },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const { data: rpcData, error: rpcError } = await admin.rpc(
    "transfer_team_ownership_atomic",
    {
      p_team_id: teamContext.teamId,
      p_current_owner_user_id: user.id,
      p_next_owner_user_id: nextOwnerUserId,
    },
  );
  if (rpcError) {
    logger.error("Failed to transfer team ownership atomically", rpcError);
    logAuditEvent({
      action: "team.ownership.transfer",
      outcome: "failure",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      resourceId: nextOwnerUserId,
      metadata: { reason: "rpc_error" },
    });
    return NextResponse.json({ error: t("errors.unableToTransfer") }, { status: 500 });
  }

  const rpcRow = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
    | TransferOwnershipRpcResult
    | null;
  if (!rpcRow || !rpcRow.ok) {
    const code = rpcRow?.error_code;
    if (code === "target_not_found") {
      return NextResponse.json({ error: t("errors.targetNotFound") }, { status: 404 });
    }
    if (code === "target_already_owner") {
      return NextResponse.json({ error: t("errors.targetAlreadyOwner") }, { status: 409 });
    }
    if (code === "not_current_owner") {
      return NextResponse.json({ error: t("errors.forbidden") }, { status: 403 });
    }
    if (code === "same_user") {
      return NextResponse.json({ error: t("errors.alreadyOwner") }, { status: 409 });
    }

    logAuditEvent({
      action: "team.ownership.transfer",
      outcome: "failure",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      resourceId: nextOwnerUserId,
      metadata: { reason: code ?? "unknown" },
    });
    return NextResponse.json({ error: t("errors.unableToTransfer") }, { status: 500 });
  }

  invalidateCachedTeamContextForUser(user.id);
  invalidateCachedTeamContextForUser(nextOwnerUserId);

  logAuditEvent({
    action: "team.ownership.transfer",
    outcome: "success",
    actorUserId: user.id,
    teamId: teamContext.teamId,
    resourceId: nextOwnerUserId,
  });
  return NextResponse.json({ ok: true });
}
