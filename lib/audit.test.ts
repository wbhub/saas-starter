import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AuditModule = typeof import("./audit");

let afterCallbacks: (() => Promise<void> | void)[] = [];

async function runAfterCallbacks() {
  const callbacks = afterCallbacks.splice(0);
  for (const cb of callbacks) {
    await cb();
  }
}

async function loadAuditModule({
  env = {},
  insert = vi.fn().mockResolvedValue({ error: null }),
}: {
  env?: Record<string, string>;
  insert?: ReturnType<typeof vi.fn>;
} = {}) {
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const deadLetterInsert = vi.fn().mockResolvedValue({ error: null });
  vi.doMock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
      from: vi.fn((table: string) => ({
        insert: table === "audit_event_dead_letters" ? deadLetterInsert : insert,
      })),
    }),
  }));
  vi.doMock("@/lib/logger", () => ({ logger }));
  vi.doMock("next/server", () => ({
    after: (cb: () => Promise<void> | void) => {
      afterCallbacks.push(cb);
    },
  }));

  const audit = (await import("./audit")) as AuditModule;
  audit.__resetAuditBufferForTests();
  return { ...audit, insert, deadLetterInsert, logger };
}

describe("audit batching", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    afterCallbacks = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("flushes queued events via after() and logs normalized audit payload", async () => {
    const { logAuditEvent, insert, logger } = await loadAuditModule();

    logAuditEvent({
      action: "team.invite.create",
      outcome: "success",
      actorUserId: "user-1",
      teamId: "team-1",
      resourceId: "invite-1",
      metadata: { source: "test" },
    });
    logAuditEvent({
      action: "team.invite.create",
      outcome: "failure",
    });

    expect(insert).not.toHaveBeenCalled();
    await runAfterCallbacks();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        action: "team.invite.create",
        outcome: "success",
        actor_user_id: "user-1",
        team_id: "team-1",
        resource_id: "invite-1",
        metadata: { source: "test" },
      }),
      expect.objectContaining({
        action: "team.invite.create",
        outcome: "failure",
        actor_user_id: null,
        team_id: null,
        resource_id: null,
        metadata: {},
      }),
    ]);
    expect(logger.info).toHaveBeenCalledWith(
      "audit_event",
      expect.objectContaining({
        audit: true,
        action: "team.invite.create",
        outcome: "failure",
        actorUserId: null,
        teamId: null,
        resourceId: null,
        metadata: {},
      }),
    );
  });

  it("batches events up to AUDIT_BATCH_SIZE per insert", async () => {
    const { logAuditEvent, insert } = await loadAuditModule();

    for (let index = 1; index <= 30; index += 1) {
      logAuditEvent({ action: `event-${index}`, outcome: "success" });
    }

    expect(insert).not.toHaveBeenCalled();
    await runAfterCallbacks();

    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[0]?.[0]).toHaveLength(25);
    expect(insert.mock.calls[1]?.[0]).toHaveLength(5);
  });

  it("retries failed inserts up to max attempts then dead-letters", async () => {
    const insert = vi.fn().mockResolvedValue({ error: new Error("insert failed") });
    const { logAuditEvent, deadLetterInsert, logger } = await loadAuditModule({
      env: { AUDIT_RETRY_MAX_ATTEMPTS: "3" },
      insert,
    });

    logAuditEvent({ action: "team.member.remove", outcome: "success", teamId: "team-1" });
    await runAfterCallbacks();

    expect(insert).toHaveBeenCalledTimes(3);
    expect(deadLetterInsert).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Dropping audit batch after max retry attempts due to persistent failures",
      expect.any(Error),
      expect.objectContaining({
        droppedEvents: 1,
        maxRetryAttempts: 3,
        consecutiveFailures: 3,
      }),
    );
  });

  it("succeeds on retry after transient failure", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error("transient") })
      .mockResolvedValueOnce({ error: null });
    const { logAuditEvent, deadLetterInsert } = await loadAuditModule({ insert });

    logAuditEvent({ action: "team.member.remove", outcome: "success", teamId: "team-1" });
    await runAfterCallbacks();

    expect(insert).toHaveBeenCalledTimes(2);
    expect(deadLetterInsert).not.toHaveBeenCalled();
  });

  it("drops oldest events and persists to dead-letter when queue overflows", async () => {
    const { logAuditEvent, insert, deadLetterInsert, logger } = await loadAuditModule({
      env: { AUDIT_MAX_QUEUE_SIZE: "3" },
    });

    logAuditEvent({ action: "event-1", outcome: "success" });
    logAuditEvent({ action: "event-2", outcome: "success" });
    logAuditEvent({ action: "event-3", outcome: "success" });
    logAuditEvent({ action: "event-4", outcome: "success" });

    await runAfterCallbacks();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ action: "event-2" }),
      expect.objectContaining({ action: "event-3" }),
      expect.objectContaining({ action: "event-4" }),
    ]);
    expect(deadLetterInsert).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Audit queue capacity exceeded; dropping oldest events",
      expect.objectContaining({
        droppedEvents: 1,
        maxQueueSize: 3,
        queuedEvents: 3,
      }),
    );
  });

  it("uses fallback max queue size when env value is invalid", async () => {
    const { logAuditEvent, insert, logger } = await loadAuditModule({
      env: { AUDIT_MAX_QUEUE_SIZE: "nope" },
    });

    for (let index = 1; index <= 4; index += 1) {
      logAuditEvent({ action: `event-${index}`, outcome: "success" });
    }
    await runAfterCallbacks();

    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ action: "event-1" }),
      expect.objectContaining({ action: "event-2" }),
      expect.objectContaining({ action: "event-3" }),
      expect.objectContaining({ action: "event-4" }),
    ]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("registers only one after() callback per flush cycle", async () => {
    const { logAuditEvent, insert } = await loadAuditModule();

    logAuditEvent({ action: "event-1", outcome: "success" });
    logAuditEvent({ action: "event-2", outcome: "success" });
    logAuditEvent({ action: "event-3", outcome: "success" });

    expect(afterCallbacks).toHaveLength(1);

    await runAfterCallbacks();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ action: "event-1" }),
        expect.objectContaining({ action: "event-2" }),
        expect.objectContaining({ action: "event-3" }),
      ]),
    );
  });

  it("schedules a new after() callback for events logged after a flush completes", async () => {
    const { logAuditEvent, insert } = await loadAuditModule();

    logAuditEvent({ action: "event-1", outcome: "success" });
    await runAfterCallbacks();
    expect(insert).toHaveBeenCalledTimes(1);

    logAuditEvent({ action: "event-2", outcome: "success" });
    expect(afterCallbacks).toHaveLength(1);
    await runAfterCallbacks();
    expect(insert).toHaveBeenCalledTimes(2);
  });
});
