import { NextResponse } from "next/server";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { recoverPersonalTeamForUser } from "@/lib/team-recovery";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    key: `team-recovery:user:${user.id}`,
    ...RATE_LIMITS.teamRecoveryByUser,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many recovery requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  if (!user.email) {
    return NextResponse.json({ error: "No email found on this account." }, { status: 400 });
  }

  try {
    const teamId = await recoverPersonalTeamForUser(
      user.id,
      user.email,
      typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
    );
    return NextResponse.json({ ok: true, teamId });
  } catch (error) {
    logger.error("Failed to recover personal team", error);
    return NextResponse.json({ error: "Unable to recover a team right now." }, { status: 500 });
  }
}
