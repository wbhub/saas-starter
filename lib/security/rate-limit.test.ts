import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("checkRateLimit production fallback behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    globalThis.__saasStarterRateLimitStore = undefined;
    globalThis.__saasStarterRateLimitLastSweepAt = undefined;
    globalThis.__saasStarterRateLimitCircuitBreaker = undefined;
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("allows requests briefly when distributed limiter first fails", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        rpc: vi.fn().mockRejectedValue(new Error("supabase down")),
      }),
    }));

    const { checkRateLimit } = await import("./rate-limit");

    const result = await checkRateLimit({
      key: "prod-fail-open-key",
      limit: 3,
      windowMs: 60_000,
    });

    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("falls back to in-memory limiter after fail-open window expires", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        rpc: vi.fn().mockRejectedValue(new Error("supabase down")),
      }),
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const input = {
      key: "prod-fallback-key",
      limit: 1,
      windowMs: 60_000,
    };

    await checkRateLimit(input);
    vi.advanceTimersByTime(6_000);
    const second = await checkRateLimit(input);
    const third = await checkRateLimit(input);

    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("checkRateLimit redis behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    globalThis.__saasStarterRateLimitStore = undefined;
    globalThis.__saasStarterRateLimitLastSweepAt = undefined;
    globalThis.__saasStarterRateLimitCircuitBreaker = undefined;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses redis for distributed rate limiting when configured", async () => {
    let count = 0;
    const redis = {
      incr: vi.fn(async () => {
        count += 1;
        return count;
      }),
      expire: vi.fn(async () => 1),
      ttl: vi.fn(async () => 42),
    };
    const createAdminClient = vi.fn(() => ({
      rpc: vi.fn(),
    }));

    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => redis,
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient,
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const first = await checkRateLimit({ key: "redis-key", limit: 1, windowMs: 60_000 });
    const second = await checkRateLimit({ key: "redis-key", limit: 1, windowMs: 60_000 });

    expect(first).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(second).toEqual({ allowed: false, retryAfterSeconds: 42 });
    expect(redis.expire).toHaveBeenCalledTimes(1);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("falls back to existing supabase limiter path when redis fails", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: true, retry_after_seconds: 0 },
      error: null,
    });

    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => ({
        incr: vi.fn().mockRejectedValue(new Error("redis down")),
      }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        rpc,
      }),
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const result = await checkRateLimit({
      key: "redis-fallback-key",
      limit: 5,
      windowMs: 60_000,
    });

    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
