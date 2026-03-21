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

type AuditInsertRow = {
  action: string;
  outcome: AuditOutcome;
  actor_user_id: string | null;
  team_id: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
};

const AUDIT_BATCH_SIZE = 25;
const AUDIT_FLUSH_INTERVAL_MS = 200;

const auditInsertQueue: AuditInsertRow[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<void> | null = null;

function mapAuditEventToRow(event: AuditEvent): AuditInsertRow {
  return {
    action: event.action,
    outcome: event.outcome,
    actor_user_id: event.actorUserId ?? null,
    team_id: event.teamId ?? null,
    resource_id: event.resourceId ?? null,
    metadata: event.metadata ?? {},
  };
}

function scheduleFlush() {
  if (flushTimer || process.env.NODE_ENV === "test") {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAuditQueue().catch((error) => {
      logger.error("Failed to persist audit event batch", error, {
        queuedEvents: auditInsertQueue.length,
      });
    });
  }, AUDIT_FLUSH_INTERVAL_MS);
}

async function persistBatch(batch: AuditInsertRow[]) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("audit_events").insert(batch);

  if (error) {
    throw error;
  }
}

async function flushAuditQueue() {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  if (flushInFlight) {
    await flushInFlight;
    return;
  }

  if (auditInsertQueue.length === 0) {
    return;
  }

  const batch = auditInsertQueue.splice(0, AUDIT_BATCH_SIZE);
  flushInFlight = persistBatch(batch);

  try {
    await flushInFlight;
  } catch (error) {
    auditInsertQueue.unshift(...batch);
    throw error;
  } finally {
    flushInFlight = null;
    if (auditInsertQueue.length > 0) {
      scheduleFlush();
    }
  }
}

function enqueueAuditEvent(event: AuditEvent) {
  auditInsertQueue.push(mapAuditEventToRow(event));
  if (auditInsertQueue.length >= AUDIT_BATCH_SIZE) {
    void flushAuditQueue().catch((error) => {
      logger.error("Failed to persist audit event batch", error, {
        queuedEvents: auditInsertQueue.length,
      });
    });
    return;
  }

  scheduleFlush();
}

export function logAuditEvent(event: AuditEvent) {
  if (process.env.NODE_ENV !== "test") {
    enqueueAuditEvent(event);
  }

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

export function __resetAuditBufferForTests() {
  auditInsertQueue.length = 0;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushInFlight = null;
}
