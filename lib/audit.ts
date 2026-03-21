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

function getBoundedFloatFromEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name]);
  if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
    return parsed;
  }
  return fallback;
}

const AUDIT_BATCH_SIZE = 25;
const AUDIT_FLUSH_INTERVAL_MS = 200;
const AUDIT_MAX_QUEUE_SIZE = getPositiveIntegerFromEnv("AUDIT_MAX_QUEUE_SIZE", 1000);
const AUDIT_RETRY_MAX_INTERVAL_MS = getPositiveIntegerFromEnv("AUDIT_RETRY_MAX_INTERVAL_MS", 5000);
const AUDIT_RETRY_MAX_ATTEMPTS = getPositiveIntegerFromEnv("AUDIT_RETRY_MAX_ATTEMPTS", 5);
const AUDIT_RETRY_JITTER_FACTOR = getBoundedFloatFromEnv("AUDIT_RETRY_JITTER_FACTOR", 0.2, 0, 1);

const auditInsertQueue: AuditInsertRow[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<void> | null = null;
let consecutiveFlushFailures = 0;

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

function getRetryDelayMs() {
  if (consecutiveFlushFailures <= 0) {
    return AUDIT_FLUSH_INTERVAL_MS;
  }

  const exponentialDelay = AUDIT_FLUSH_INTERVAL_MS * 2 ** consecutiveFlushFailures;
  const boundedExponentialDelay = Math.min(exponentialDelay, AUDIT_RETRY_MAX_INTERVAL_MS);
  if (AUDIT_RETRY_JITTER_FACTOR <= 0) {
    return boundedExponentialDelay;
  }

  const jitterMultiplier =
    1 + (Math.random() * 2 - 1) * AUDIT_RETRY_JITTER_FACTOR;
  const jitteredDelay = Math.round(boundedExponentialDelay * jitterMultiplier);
  return Math.max(
    AUDIT_FLUSH_INTERVAL_MS,
    Math.min(jitteredDelay, AUDIT_RETRY_MAX_INTERVAL_MS),
  );
}

function enforceQueueLimit() {
  if (auditInsertQueue.length <= AUDIT_MAX_QUEUE_SIZE) {
    return;
  }

  const droppedEvents = auditInsertQueue.length - AUDIT_MAX_QUEUE_SIZE;
  auditInsertQueue.splice(0, droppedEvents);
  logger.warn("Audit queue capacity exceeded; dropping oldest events", {
    droppedEvents,
    maxQueueSize: AUDIT_MAX_QUEUE_SIZE,
    queuedEvents: auditInsertQueue.length,
  });
}

function scheduleFlush(delayMs = AUDIT_FLUSH_INTERVAL_MS) {
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
  }, delayMs);
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
    consecutiveFlushFailures = 0;
  } catch (error) {
    consecutiveFlushFailures += 1;
    if (consecutiveFlushFailures >= AUDIT_RETRY_MAX_ATTEMPTS) {
      logger.error(
        "Dropping audit batch after max retry attempts due to persistent failures",
        error,
        {
          droppedEvents: batch.length,
          maxRetryAttempts: AUDIT_RETRY_MAX_ATTEMPTS,
          consecutiveFlushFailures,
          queuedEvents: auditInsertQueue.length,
        },
      );
      consecutiveFlushFailures = 0;
      return;
    }
    auditInsertQueue.unshift(...batch);
    enforceQueueLimit();
    throw error;
  } finally {
    flushInFlight = null;
    if (auditInsertQueue.length > 0) {
      scheduleFlush(getRetryDelayMs());
    }
  }
}

function enqueueAuditEvent(event: AuditEvent) {
  auditInsertQueue.push(mapAuditEventToRow(event));
  enforceQueueLimit();
  if (auditInsertQueue.length >= AUDIT_BATCH_SIZE) {
    if (consecutiveFlushFailures > 0) {
      scheduleFlush(getRetryDelayMs());
      return;
    }
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
  consecutiveFlushFailures = 0;
}
