import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { createClient } from "@/lib/supabase/server";
import { getTeamContextForUser } from "@/lib/team-context";
import { requireJsonContentType } from "@/lib/http/content-type";
import { parseJsonWithSchema, z } from "@/lib/http/request-validation";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyCsrfProtection } from "@/lib/security/csrf";
import { logger } from "@/lib/logger";
import { getRouteTranslator } from "@/lib/i18n/locale";

const teamSettingsSchema = z.object({
  teamName: z.string().trim().min(2).max(80),
});

export async function PATCH(request: Request) {
  const t = await getRouteTranslator("ApiTeamSettings", request);
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

  const teamContext = await getTeamContextForUser(supabase, user.id);
  if (!teamContext) {
    return NextResponse.json(
      { error: t("errors.noTeamMembership") },
      { status: 403 },
    );
  }

  if (teamContext.role !== "owner" && teamContext.role !== "admin") {
    return NextResponse.json(
      { error: t("errors.forbidden") },
      { status: 403 },
    );
  }

  const rateLimit = await checkRateLimit({
    key: `team-settings:update:${teamContext.teamId}:${user.id}`,
    ...RATE_LIMITS.teamSettingsUpdateByActor,
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

  const parseResult = await parseJsonWithSchema(request, teamSettingsSchema);
  if (!parseResult.success) {
    if (parseResult.tooLarge) {
      return NextResponse.json({ error: t("errors.payloadTooLarge") }, { status: 413 });
    }
    return NextResponse.json({ error: t("errors.invalidPayload") }, { status: 400 });
  }

  const { teamName } = parseResult.data;
  const { error } = await supabase
    .from("teams")
    .update({ name: teamName })
    .eq("id", teamContext.teamId);

  if (error) {
    logger.error("Failed to update organization settings", error);
    logAuditEvent({
      action: "team.settings.update",
      outcome: "failure",
      actorUserId: user.id,
      teamId: teamContext.teamId,
      metadata: { reason: "update_error" },
    });
    return NextResponse.json({ error: t("errors.unableToUpdate") }, { status: 500 });
  }

  logAuditEvent({
    action: "team.settings.update",
    outcome: "success",
    actorUserId: user.id,
    teamId: teamContext.teamId,
    metadata: { teamName },
  });
  return NextResponse.json({ ok: true });
}
