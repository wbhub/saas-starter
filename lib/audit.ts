import { after } from "next/server";
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

function getPositiveIntegerFromEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

const AUDIT_BATCH_SIZE = 25;
const AUDIT_MAX_QUEUE_SIZE = getPositiveIntegerFromEnv("AUDIT_MAX_QUEUE_SIZE", 1000);
const AUDIT_RETRY_MAX_ATTEMPTS = getPositiveIntegerFromEnv("AUDIT_RETRY_MAX_ATTEMPTS", 5);

const auditInsertQueue: AuditInsertRow[] = [];
const deadLetterEntries: { events: AuditInsertRow[]; reason: string }[] = [];
let flushScheduled = false;

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

async function persistToDeadLetterQueue(events: AuditInsertRow[], reason: string) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("audit_event_dead_letters").insert({
      events: JSON.parse(JSON.stringify(events)),
      reason,
      event_count: events.length,
    });
    if (error) {
      logger.error("Failed to persist dropped audit events to dead-letter table", {
        error,
        droppedEvents: events.length,
        reason,
      });
    }
  } catch (error) {
    logger.error("Failed to persist dropped audit events to dead-letter table", error, {
      droppedEvents: events.length,
      reason,
    });
  }
}

function enforceQueueLimit() {
  if (auditInsertQueue.length <= AUDIT_MAX_QUEUE_SIZE) {
    return;
  }

  const droppedEvents = auditInsertQueue.length - AUDIT_MAX_QUEUE_SIZE;
  const dropped = auditInsertQueue.splice(0, droppedEvents);
  logger.error("Audit queue capacity exceeded; dropping oldest events", {
    droppedEvents,
    maxQueueSize: AUDIT_MAX_QUEUE_SIZE,
    queuedEvents: auditInsertQueue.length,
  });
  deadLetterEntries.push({ events: dropped, reason: "queue_overflow" });
}

async function persistBatch(batch: AuditInsertRow[]) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("audit_events").insert(batch);

  if (error) {
    throw error;
  }
}

async function flushAuditQueue() {
  while (deadLetterEntries.length > 0) {
    const entry = deadLetterEntries.shift()!;
    await persistToDeadLetterQueue(entry.events, entry.reason);
  }

  while (auditInsertQueue.length > 0) {
    const batch = auditInsertQueue.splice(0, AUDIT_BATCH_SIZE);

    for (let attempt = 1; attempt <= AUDIT_RETRY_MAX_ATTEMPTS; attempt++) {
      try {
        await persistBatch(batch);
        break;
      } catch (error) {
        if (attempt >= AUDIT_RETRY_MAX_ATTEMPTS) {
          logger.error(
            "Dropping audit batch after max retry attempts due to persistent failures",
            error,
            {
              droppedEvents: batch.length,
              maxRetryAttempts: AUDIT_RETRY_MAX_ATTEMPTS,
              consecutiveFailures: attempt,
              queuedEvents: auditInsertQueue.length,
            },
          );
          await persistToDeadLetterQueue(batch, "retry_exhaustion");
        }
      }
    }
  }

  flushScheduled = false;
}

function scheduleFlush() {
  if (flushScheduled) {
    return;
  }
  flushScheduled = true;

  const doFlush = async () => {
    try {
      await flushAuditQueue();
    } catch (error) {
      logger.error("Failed to flush audit queue", error, {
        queuedEvents: auditInsertQueue.length,
      });
    }
  };

  try {
    after(doFlush);
  } catch {
    // after() throws outside a Next.js request scope (e.g. in tests).
    // Fall back to a best-effort fire-and-forget flush.
    void doFlush();
  }
}

function enqueueAuditEvent(event: AuditEvent) {
  auditInsertQueue.push(mapAuditEventToRow(event));
  enforceQueueLimit();
  scheduleFlush();
}

export function logAuditEvent(event: AuditEvent) {
  enqueueAuditEvent(event);

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
  deadLetterEntries.length = 0;
  flushScheduled = false;
}
