import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("audit batching", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("flushes multiple queued events in one insert", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn(() => ({
          insert,
        })),
      }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    const { logAuditEvent, __resetAuditBufferForTests } = await import("./audit");
    __resetAuditBufferForTests();

    logAuditEvent({ action: "team.invite.create", outcome: "success", teamId: "team-1" });
    logAuditEvent({ action: "team.invite.create", outcome: "failure", teamId: "team-1" });

    expect(insert).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ action: "team.invite.create", outcome: "success" }),
        expect.objectContaining({ action: "team.invite.create", outcome: "failure" }),
      ]),
    );
  });

  it("requeues failed writes and retries with exponential backoff", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error("insert failed") })
      .mockResolvedValueOnce({ error: null });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn(() => ({
          insert,
        })),
      }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    const { logAuditEvent, __resetAuditBufferForTests } = await import("./audit");
    __resetAuditBufferForTests();

    logAuditEvent({ action: "team.member.remove", outcome: "success", teamId: "team-1" });

    await vi.advanceTimersByTimeAsync(250);
    expect(insert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300);
    expect(insert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1]?.[0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "team.member.remove" })]),
    );
  });

  it("applies jitter to exponential retry delay", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error("insert failed") })
      .mockResolvedValueOnce({ error: null });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn(() => ({
          insert,
        })),
      }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    const { logAuditEvent, __resetAuditBufferForTests } = await import("./audit");
    __resetAuditBufferForTests();

    logAuditEvent({ action: "team.member.remove", outcome: "success", teamId: "team-1" });

    await vi.advanceTimersByTimeAsync(250);
    expect(insert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(400);
    expect(insert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(40);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("drops batches after max retry attempts under sustained failure", async () => {
    vi.stubEnv("AUDIT_RETRY_MAX_ATTEMPTS", "2");
    const insert = vi.fn().mockResolvedValue({ error: new Error("insert failed") });
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn(() => ({
          insert,
        })),
      }),
    }));
    vi.doMock("@/lib/logger", () => ({ logger }));

    const { logAuditEvent, __resetAuditBufferForTests } = await import("./audit");
    __resetAuditBufferForTests();

    logAuditEvent({ action: "team.member.remove", outcome: "success", teamId: "team-1" });

    await vi.advanceTimersByTimeAsync(250);
    expect(insert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(450);
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

  it("caps the queue and drops oldest events when capacity is exceeded", async () => {
    vi.stubEnv("AUDIT_MAX_QUEUE_SIZE", "3");
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn(() => ({
          insert,
        })),
      }),
    }));
    vi.doMock("@/lib/logger", () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    const { logAuditEvent, __resetAuditBufferForTests } = await import("./audit");
    __resetAuditBufferForTests();

    logAuditEvent({ action: "event-1", outcome: "success" });
    logAuditEvent({ action: "event-2", outcome: "success" });
    logAuditEvent({ action: "event-3", outcome: "success" });
    logAuditEvent({ action: "event-4", outcome: "success" });

    await vi.advanceTimersByTimeAsync(250);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "event-2" }),
        expect.objectContaining({ action: "event-3" }),
        expect.objectContaining({ action: "event-4" }),
      ]),
    );
    expect(insert.mock.calls[0]?.[0]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "event-1" })]),
    );
  });
});
