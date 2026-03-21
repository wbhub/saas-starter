import { NextResponse } from "next/server";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { recoverPersonalTeamForUser } from "@/lib/team-recovery";
import { logger } from "@/lib/logger";
import { getRouteTranslator } from "@/lib/i18n/locale";
import { invalidateCachedTeamContextForUser } from "@/lib/team-context-cache";

export async function POST(request: Request) {
  const t = await getRouteTranslator("ApiTeamRecoverPersonal", request);
  const csrfError = verifyCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: t("errors.unauthorized") }, { status: 401 });
  }

  const rateLimit = await checkRateLimit({
    key: `team-recovery:user:${user.id}`,
    ...RATE_LIMITS.teamRecoveryByUser,
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

  if (!user.email) {
    return NextResponse.json({ error: t("errors.noEmailOnAccount") }, { status: 400 });
  }

  try {
    const teamId = await recoverPersonalTeamForUser(
      user.id,
      user.email,
      typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
    );
    await invalidateCachedTeamContextForUser(user.id);
    return NextResponse.json({ ok: true, teamId });
  } catch (error) {
    logger.error("Failed to recover personal team", error);
    return NextResponse.json({ error: t("errors.unableToRecover") }, { status: 500 });
  }
}
