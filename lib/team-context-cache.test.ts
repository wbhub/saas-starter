import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TeamContext = {
  teamId: string;
  teamName: string | null;
  role: "owner" | "admin" | "member";
};

type GlobalCacheState = typeof globalThis & {
  __saasStarterTeamContextCache?: Map<string, { value: TeamContext | null; expiresAt: number }>;
  __saasStarterTeamContextCacheLastSweepAt?: number;
};

const TEST_USER_ID = "user-1";
const TEST_CACHE_KEY = `team-context:${TEST_USER_ID}`;
const TEST_TEAM_CONTEXT: TeamContext = {
  teamId: "team-1",
  teamName: "Alpha",
  role: "owner",
};

describe("team context cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const globalCacheState = globalThis as GlobalCacheState;
    globalCacheState.__saasStarterTeamContextCache = undefined;
    globalCacheState.__saasStarterTeamContextCacheLastSweepAt = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses in-memory fallback cache with TTL", async () => {
    const getTeamContextForUser = vi.fn().mockResolvedValue(TEST_TEAM_CONTEXT);

    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => null,
    }));
    vi.doMock("@/lib/team-context", () => ({
      getTeamContextForUser,
    }));

    const { getCachedTeamContextForUser } = await import("./team-context-cache");
    const supabase = {} as never;

    const first = await getCachedTeamContextForUser(supabase, TEST_USER_ID);
    const second = await getCachedTeamContextForUser(supabase, TEST_USER_ID);
    expect(first).toEqual(TEST_TEAM_CONTEXT);
    expect(second).toEqual(TEST_TEAM_CONTEXT);
    expect(getTeamContextForUser).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_001);
    const afterTtl = await getCachedTeamContextForUser(supabase, TEST_USER_ID);
    expect(afterTtl).toEqual(TEST_TEAM_CONTEXT);
    expect(getTeamContextForUser).toHaveBeenCalledTimes(2);
  });

  it("accepts object responses from redis cache", async () => {
    const getTeamContextForUser = vi.fn();
    const redis = {
      get: vi.fn().mockResolvedValue(TEST_TEAM_CONTEXT),
      set: vi.fn(),
      del: vi.fn(),
    };

    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => redis,
    }));
    vi.doMock("@/lib/team-context", () => ({
      getTeamContextForUser,
    }));

    const { getCachedTeamContextForUser } = await import("./team-context-cache");
    const result = await getCachedTeamContextForUser({} as never, TEST_USER_ID);

    expect(result).toEqual(TEST_TEAM_CONTEXT);
    expect(getTeamContextForUser).not.toHaveBeenCalled();
  });

  it("invalidates both fallback and redis cache", async () => {
    const getTeamContextForUser = vi.fn().mockResolvedValue(TEST_TEAM_CONTEXT);
    const redisStore = new Map<string, TeamContext | null>();
    const redis = {
      get: vi.fn(async (key: string) => redisStore.get(key)),
      set: vi.fn(async (key: string, value: TeamContext | null) => {
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
    vi.doMock("@/lib/team-context", () => ({
      getTeamContextForUser,
    }));

    const { getCachedTeamContextForUser, invalidateCachedTeamContextForUser } =
      await import("./team-context-cache");
    await getCachedTeamContextForUser({} as never, TEST_USER_ID);
    expect(getTeamContextForUser).toHaveBeenCalledTimes(1);
    expect(redisStore.get(TEST_CACHE_KEY)).toEqual(TEST_TEAM_CONTEXT);

    invalidateCachedTeamContextForUser(TEST_USER_ID);

    const globalCacheState = globalThis as GlobalCacheState;
    expect(globalCacheState.__saasStarterTeamContextCache?.has(TEST_CACHE_KEY)).toBe(false);
    expect(redis.del).toHaveBeenCalledWith(TEST_CACHE_KEY);
    expect(redisStore.has(TEST_CACHE_KEY)).toBe(false);

    await getCachedTeamContextForUser({} as never, TEST_USER_ID);
    expect(getTeamContextForUser).toHaveBeenCalledTimes(2);
  });

  it("enforces max entries for in-memory fallback cache", async () => {
    const now = Date.now();
    const entries = new Map<string, { value: TeamContext | null; expiresAt: number }>();
    for (let index = 0; index < 10_050; index += 1) {
      entries.set(`team-context:seed-${index}`, {
        value: TEST_TEAM_CONTEXT,
        expiresAt: now + 60_000,
      });
    }
    const globalCacheState = globalThis as GlobalCacheState;
    globalCacheState.__saasStarterTeamContextCache = entries;
    globalCacheState.__saasStarterTeamContextCacheLastSweepAt = now;

    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => null,
    }));
    vi.doMock("@/lib/team-context", () => ({
      getTeamContextForUser: vi.fn().mockResolvedValue(TEST_TEAM_CONTEXT),
    }));

    const { getCachedTeamContextForUser } = await import("./team-context-cache");
    await getCachedTeamContextForUser({} as never, TEST_USER_ID);

    expect(globalCacheState.__saasStarterTeamContextCache?.size).toBeLessThanOrEqual(10_000);
  });
});
