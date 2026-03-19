import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireJsonContentType } from "@/lib/http/content-type";
import { getClientRateLimitIdentifier } from "@/lib/http/client-ip";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { hashInviteToken } from "@/lib/team-invites";
import { syncTeamSeatQuantity } from "@/lib/stripe/seats";
import { logger } from "@/lib/logger";

type AcceptInvitePayload = {
  token?: string;
};

type AcceptInviteRpcResult = {
  ok: boolean;
  error_code: string | null;
  team_id: string | null;
  team_name: string | null;
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

  const body = (await request.json().catch(() => null)) as AcceptInvitePayload | null;
  const token = body?.token?.trim() ?? "";
  if (token.length < 10 || token.length > 256) {
    return NextResponse.json({ error: "Invalid invite token." }, { status: 400 });
  }

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
      limit: 20,
      windowMs: 10 * 60 * 1000,
    }),
    checkRateLimit({
      key: `team-invite:accept:${clientId.keyType}:${clientId.value}`,
      limit: 40,
      windowMs: 10 * 60 * 1000,
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
    return NextResponse.json({ error: "Unable to accept invite." }, { status: 500 });
  }

  const rpcRow = (Array.isArray(data) ? data[0] : data) as AcceptInviteRpcResult | null;
  if (!rpcRow || !rpcRow.ok) {
    const code = rpcRow?.error_code;
    if (code === "not_found") {
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

  if (rpcRow.team_id) {
    try {
      await syncTeamSeatQuantity(rpcRow.team_id, {
        idempotencyKey: `seat-sync:accept-invite:${rpcRow.team_id}:${user.id}`,
      });
    } catch (error) {
      logger.error("Accepted invite but failed to sync Stripe seat quantity", error);
    }
  }

  return NextResponse.json({
    ok: true,
    teamName: rpcRow.team_name ?? "Team",
  });
}
