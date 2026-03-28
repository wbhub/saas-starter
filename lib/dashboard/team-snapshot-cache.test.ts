import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DashboardTeamSnapshot = {
  billingContext: {
    billingEnabled: boolean;
    subscription: null;
    effectivePlanKey: "free";
    memberCount: number;
    isPaidPlan: boolean;
    canInviteMembers: boolean;
  };
  aiUiGate: {
    isVisibleInUi: boolean;
    reason: "enabled";
    effectivePlanKey: "free";
    accessMode: "all";
  };
  teamUiMode: "free";
};

type GlobalCacheState = typeof globalThis & {
  __saasStarterDashboardTeamSnapshotCache?: Map<
    string,
    { value: DashboardTeamSnapshot; expiresAt: number }
  >;
  __saasStarterDashboardTeamSnapshotCacheLastSweepAt?: number;
};

const TEST_TEAM_ID = "team-1";
const TEST_CACHE_KEY = `dashboard-team-snapshot:${TEST_TEAM_ID}`;
const TEST_SNAPSHOT: DashboardTeamSnapshot = {
  billingContext: {
    billingEnabled: true,
    subscription: null,
    effectivePlanKey: "free",
    memberCount: 1,
    isPaidPlan: false,
    canInviteMembers: false,
  },
  aiUiGate: {
    isVisibleInUi: true,
    reason: "enabled",
    effectivePlanKey: "free",
    accessMode: "all",
  },
  teamUiMode: "free",
};

describe("dashboard team snapshot cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const globalCacheState = globalThis as GlobalCacheState;
    globalCacheState.__saasStarterDashboardTeamSnapshotCache = undefined;
    globalCacheState.__saasStarterDashboardTeamSnapshotCacheLastSweepAt = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses in-memory cache with TTL", async () => {
    const resolveDashboardTeamSnapshot = vi.fn().mockResolvedValue(TEST_SNAPSHOT);

    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => null,
    }));
    vi.doMock("@/lib/dashboard/team-snapshot", () => ({
      resolveDashboardTeamSnapshot,
    }));

    const { getCachedDashboardTeamSnapshot } = await import("./team-snapshot-cache");
    const supabase = {} as never;

    const first = await getCachedDashboardTeamSnapshot(supabase, TEST_TEAM_ID);
    const second = await getCachedDashboardTeamSnapshot(supabase, TEST_TEAM_ID);

    expect(first).toEqual(TEST_SNAPSHOT);
    expect(second).toEqual(TEST_SNAPSHOT);
    expect(resolveDashboardTeamSnapshot).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(120_001);

    const afterTtl = await getCachedDashboardTeamSnapshot(supabase, TEST_TEAM_ID);
    expect(afterTtl).toEqual(TEST_SNAPSHOT);
    expect(resolveDashboardTeamSnapshot).toHaveBeenCalledTimes(2);
  });

  it("refreshes from the data source when shared cache misses even if memory is warm", async () => {
    const freshSnapshot = {
      ...TEST_SNAPSHOT,
      billingContext: {
        ...TEST_SNAPSHOT.billingContext,
        memberCount: 2,
      },
      teamUiMode: "free" as const,
    };
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn(),
    };
    const resolveDashboardTeamSnapshot = vi.fn().mockResolvedValue(freshSnapshot);

    const now = Date.now();
    const globalCacheState = globalThis as GlobalCacheState;
    globalCacheState.__saasStarterDashboardTeamSnapshotCache = new Map([
      [
        TEST_CACHE_KEY,
        {
          value: TEST_SNAPSHOT,
          expiresAt: now + 60_000,
        },
      ],
    ]);
    globalCacheState.__saasStarterDashboardTeamSnapshotCacheLastSweepAt = now;

    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => redis,
    }));
    vi.doMock("@/lib/dashboard/team-snapshot", () => ({
      resolveDashboardTeamSnapshot,
    }));

    const { getCachedDashboardTeamSnapshot } = await import("./team-snapshot-cache");

    const result = await getCachedDashboardTeamSnapshot({} as never, TEST_TEAM_ID);

    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(resolveDashboardTeamSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toEqual(freshSnapshot);
  });

  it("writes through to redis and backfills memory from redis hits for fallback use", async () => {
    const resolveDashboardTeamSnapshot = vi.fn().mockResolvedValue(TEST_SNAPSHOT);
    let redisAvailable = true;
    const redis = {
      get: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(TEST_SNAPSHOT),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn(),
    };

    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => (redisAvailable ? redis : null),
    }));
    vi.doMock("@/lib/dashboard/team-snapshot", () => ({
      resolveDashboardTeamSnapshot,
    }));

    const { getCachedDashboardTeamSnapshot, invalidateCachedDashboardTeamSnapshot } =
      await import("./team-snapshot-cache");

    await getCachedDashboardTeamSnapshot({} as never, TEST_TEAM_ID);
    expect(redis.set).toHaveBeenCalledWith(TEST_CACHE_KEY, TEST_SNAPSHOT, { ex: 120 });

    await invalidateCachedDashboardTeamSnapshot(TEST_TEAM_ID);
    await getCachedDashboardTeamSnapshot({} as never, TEST_TEAM_ID);
    redis.get.mockClear();
    redisAvailable = false;

    await getCachedDashboardTeamSnapshot({} as never, TEST_TEAM_ID);

    expect(redis.get).not.toHaveBeenCalled();
  });

  it("invalidates both in-memory and redis caches", async () => {
    const resolveDashboardTeamSnapshot = vi.fn().mockResolvedValue(TEST_SNAPSHOT);
    const redisStore = new Map<string, DashboardTeamSnapshot>();
    const redis = {
      get: vi.fn(async (key: string) => redisStore.get(key)),
      set: vi.fn(async (key: string, value: DashboardTeamSnapshot) => {
        redisStore.set(key, value);
        return "OK";
      }),
      del: vi.fn(async (key: string) => {
        redisStore.delete(key);
        return 1;
      }),
    };

    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => redis,
    }));
    vi.doMock("@/lib/dashboard/team-snapshot", () => ({
      resolveDashboardTeamSnapshot,
    }));

    const { getCachedDashboardTeamSnapshot, invalidateCachedDashboardTeamSnapshot } =
      await import("./team-snapshot-cache");

    await getCachedDashboardTeamSnapshot({} as never, TEST_TEAM_ID);
    expect(redisStore.get(TEST_CACHE_KEY)).toEqual(TEST_SNAPSHOT);

    await invalidateCachedDashboardTeamSnapshot(TEST_TEAM_ID);

    const globalCacheState = globalThis as GlobalCacheState;
    expect(globalCacheState.__saasStarterDashboardTeamSnapshotCache?.has(TEST_CACHE_KEY)).toBe(
      false,
    );
    expect(redis.del).toHaveBeenCalledWith(TEST_CACHE_KEY);
    expect(redisStore.has(TEST_CACHE_KEY)).toBe(false);
  });
});
