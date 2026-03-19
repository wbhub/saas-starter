import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

type AuditOutcome = "success" | "failure" | "denied";

type AuditEvent = {
  action: string;
  outcome: AuditOutcome;
  actorUserId?: string | null;
  teamId?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
};

async function persistAuditEvent(event: AuditEvent) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("audit_events").insert({
    action: event.action,
    outcome: event.outcome,
    actor_user_id: event.actorUserId ?? null,
    team_id: event.teamId ?? null,
    resource_id: event.resourceId ?? null,
    metadata: event.metadata ?? {},
  });

  if (error) {
    throw error;
  }
}

export function logAuditEvent(event: AuditEvent) {
  void persistAuditEvent(event).catch((error) => {
    logger.error("Failed to persist audit event", error, {
      action: event.action,
      outcome: event.outcome,
      actorUserId: event.actorUserId ?? null,
      teamId: event.teamId ?? null,
      resourceId: event.resourceId ?? null,
    });
  });

  logger.info("audit_event", {
    audit: true,
    action: event.action,
    outcome: event.outcome,
    actorUserId: event.actorUserId ?? null,
    teamId: event.teamId ?? null,
    resourceId: event.resourceId ?? null,
    metadata: event.metadata ?? {},
  });
}
