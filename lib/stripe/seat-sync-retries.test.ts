import { beforeEach, describe, expect, it, vi } from "vitest";

type SelectResult = {
  data: { team_id: string; attempt_count: number } | null;
  error: { message: string } | null;
};

function createAdminMock({
  selectResult = { data: null, error: null } as SelectResult,
  upsertError = null as { message: string } | null,
  deleteError = null as { message: string } | null,
  dueData = [] as Array<{ team_id: string | null }>,
  dueError = null as { message: string } | null,
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue(selectResult);
  const upsert = vi.fn().mockResolvedValue({ error: upsertError });
  const deleteEq = vi.fn().mockResolvedValue({ error: deleteError });
  const dueLimit = vi.fn().mockResolvedValue({ data: dueData, error: dueError });

  return {
    maybeSingle,
    upsert,
    deleteEq,
    dueLimit,
    from: vi.fn((table: string) => {
      if (table !== "seat_sync_retries") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select: vi.fn((columns: string) => {
          if (columns === "team_id,attempt_count") {
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle,
              }),
            };
          }
          return {
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: dueLimit,
          };
        }),
        upsert,
        delete: vi.fn(() => ({
          eq: deleteEq,
        })),
      };
    }),
  };
}

describe("seat-sync-retries", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("enqueues first retry with one-minute backoff", async () => {
    const admin = createAdminMock();
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from: admin.from }),
    }));

    const { enqueueSeatSyncRetry } = await import("./seat-sync-retries");
    await enqueueSeatSyncRetry({
      teamId: "team_123",
      source: "seat_sync",
      error: new Error("first failure"),
    });

    expect(admin.upsert).toHaveBeenCalledTimes(1);
    const payload = admin.upsert.mock.calls[0]?.[0] as Record<string, string | number>;
    const nextAttemptAtMs = new Date(String(payload.next_attempt_at)).getTime();
    expect(payload.attempt_count).toBe(1);
    expect(payload.reason).toBe("seat_sync");
    expect(payload.last_error).toBe("first failure");
    expect(nextAttemptAtMs - Date.now()).toBe(60_000);
  });

  it("applies exponential backoff and caps retry delay at one hour", async () => {
    const admin = createAdminMock({
      selectResult: {
        data: { team_id: "team_123", attempt_count: 20 },
        error: null,
      },
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from: admin.from }),
    }));

    const { enqueueSeatSyncRetry } = await import("./seat-sync-retries");
    await enqueueSeatSyncRetry({
      teamId: "team_123",
      source: "seat_sync",
      error: "still failing",
    });

    const payload = admin.upsert.mock.calls[0]?.[0] as Record<string, string | number>;
    const nextAttemptAtMs = new Date(String(payload.next_attempt_at)).getTime();
    expect(payload.attempt_count).toBe(21);
    expect(nextAttemptAtMs - Date.now()).toBe(3_600_000);
  });

  it("throws when reading existing retry row fails", async () => {
    const admin = createAdminMock({
      selectResult: {
        data: null,
        error: { message: "read failed" },
      },
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from: admin.from }),
    }));

    const { enqueueSeatSyncRetry } = await import("./seat-sync-retries");
    await expect(
      enqueueSeatSyncRetry({
        teamId: "team_123",
        source: "seat_sync",
        error: new Error("boom"),
      }),
    ).rejects.toThrow("Failed to read existing seat sync retry: read failed");
  });

  it("throws when enqueue upsert fails", async () => {
    const admin = createAdminMock({
      upsertError: { message: "write failed" },
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from: admin.from }),
    }));

    const { enqueueSeatSyncRetry } = await import("./seat-sync-retries");
    await expect(
      enqueueSeatSyncRetry({
        teamId: "team_123",
        source: "seat_sync",
        error: "boom",
      }),
    ).rejects.toThrow("Failed to enqueue seat sync retry: write failed");
  });

  it("clears retry row for a team", async () => {
    const admin = createAdminMock();
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from: admin.from }),
    }));

    const { clearSeatSyncRetry } = await import("./seat-sync-retries");
    await clearSeatSyncRetry("team_123");

    expect(admin.deleteEq).toHaveBeenCalledWith("team_id", "team_123");
  });

  it("returns due team ids ordered by next attempt and respects minimum limit", async () => {
    const admin = createAdminMock({
      dueData: [{ team_id: "team_a" }, { team_id: null }, { team_id: "team_b" }],
    });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ from: admin.from }),
    }));

    const { listDueSeatSyncRetryTeamIds } = await import("./seat-sync-retries");
    const due = await listDueSeatSyncRetryTeamIds(0);

    expect(admin.dueLimit).toHaveBeenCalledWith(1);
    expect(due).toEqual(["team_a", "team_b"]);
  });
});
