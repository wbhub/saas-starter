import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AuditModule = typeof import("./audit");

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

  const audit = (await import("./audit")) as AuditModule;
  audit.__resetAuditBufferForTests();
  return { ...audit, insert, deadLetterInsert, logger };
}

describe("audit batching", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("flushes queued events on timer and logs normalized audit payload", async () => {
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
    await vi.advanceTimersByTimeAsync(250);

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

  it("flushes immediately when queue reaches the batch threshold", async () => {
    const { logAuditEvent, insert } = await loadAuditModule();

    for (let index = 1; index <= 24; index += 1) {
      logAuditEvent({ action: `event-${index}`, outcome: "success" });
    }
    expect(insert).not.toHaveBeenCalled();

    logAuditEvent({ action: "event-25", outcome: "success" });
    await vi.advanceTimersByTimeAsync(0);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]?.[0]).toHaveLength(25);
  });

  it("requeues failed writes and retries with exponential backoff", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error("insert failed") })
      .mockResolvedValueOnce({ error: null });
    const { logAuditEvent } = await loadAuditModule({ insert });

    logAuditEvent({ action: "team.member.remove", outcome: "success", teamId: "team-1" });

    await vi.advanceTimersByTimeAsync(250);
    expect(insert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300);
    expect(insert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("applies jitter to exponential retry delay", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error("insert failed") })
      .mockResolvedValueOnce({ error: null });
    const { logAuditEvent } = await loadAuditModule({ insert });

    logAuditEvent({ action: "team.member.remove", outcome: "success", teamId: "team-1" });
    await vi.advanceTimersByTimeAsync(250);
    expect(insert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(429);
    expect(insert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("retries without jitter when jitter factor is set to zero", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error("insert failed") })
      .mockResolvedValueOnce({ error: null });
    const { logAuditEvent } = await loadAuditModule({
      env: { AUDIT_RETRY_JITTER_FACTOR: "0" },
      insert,
    });

    logAuditEvent({ action: "team.member.remove", outcome: "success", teamId: "team-1" });
    await vi.advanceTimersByTimeAsync(250);
    expect(insert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(349);
    expect(insert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("uses fallback jitter factor when env value is out of bounds", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error("insert failed") })
      .mockResolvedValueOnce({ error: null });
    const { logAuditEvent } = await loadAuditModule({
      env: { AUDIT_RETRY_JITTER_FACTOR: "2" },
      insert,
    });

    logAuditEvent({ action: "team.member.remove", outcome: "success", teamId: "team-1" });
    await vi.advanceTimersByTimeAsync(250);

    await vi.advanceTimersByTimeAsync(429);
    expect(insert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("drops batches after max retry attempts under sustained failure", async () => {
    const insert = vi.fn().mockResolvedValue({ error: new Error("insert failed") });
    const { logAuditEvent, logger } = await loadAuditModule({
      env: { AUDIT_RETRY_MAX_ATTEMPTS: "2" },
      insert,
    });

    logAuditEvent({ action: "team.member.remove", outcome: "success", teamId: "team-1" });

    await vi.advanceTimersByTimeAsync(250);
    expect(insert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(480);
    expect(insert).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      "Dropping audit batch after max retry attempts due to persistent failures",
      expect.any(Error),
      expect.objectContaining({
        droppedEvents: 1,
        maxRetryAttempts: 2,
        consecutiveFlushFailures: 2,
      }),
    );
  });

  it("drops oldest events and logs warning when queue overflows", async () => {
    const { logAuditEvent, insert, logger } = await loadAuditModule({
      env: { AUDIT_MAX_QUEUE_SIZE: "3" },
    });

    logAuditEvent({ action: "event-1", outcome: "success" });
    logAuditEvent({ action: "event-2", outcome: "success" });
    logAuditEvent({ action: "event-3", outcome: "success" });
    logAuditEvent({ action: "event-4", outcome: "success" });

    await vi.advanceTimersByTimeAsync(250);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ action: "event-2" }),
      expect.objectContaining({ action: "event-3" }),
      expect.objectContaining({ action: "event-4" }),
    ]);
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
    await vi.advanceTimersByTimeAsync(250);

    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ action: "event-1" }),
      expect.objectContaining({ action: "event-2" }),
      expect.objectContaining({ action: "event-3" }),
      expect.objectContaining({ action: "event-4" }),
    ]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not duplicate insert work when flush is already in flight", async () => {
    const firstInsert = createDeferred<{ error: null }>();
    const insert = vi
      .fn()
      .mockImplementationOnce(() => firstInsert.promise)
      .mockResolvedValue({ error: null });
    const { logAuditEvent } = await loadAuditModule({ insert });

    for (let index = 1; index <= 25; index += 1) {
      logAuditEvent({ action: `batch-one-${index}`, outcome: "success" });
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(insert).toHaveBeenCalledTimes(1);

    for (let index = 1; index <= 25; index += 1) {
      logAuditEvent({ action: `batch-two-${index}`, outcome: "success" });
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(insert).toHaveBeenCalledTimes(1);

    firstInsert.resolve({ error: null });
    await vi.advanceTimersByTimeAsync(200);
    expect(insert).toHaveBeenCalledTimes(2);
  });
});
