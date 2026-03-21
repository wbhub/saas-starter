import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function resetGlobalLimiterState() {
  globalThis.__saasStarterRateLimitStore = undefined;
  globalThis.__saasStarterRateLimitLastSweepAt = undefined;
  globalThis.__saasStarterRateLimitCircuitBreaker = undefined;
}

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    resetGlobalLimiterState();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("allows under the limit and blocks once redis counter exceeds the limit", async () => {
    const evalMock = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const ttlMock = vi.fn().mockResolvedValue(17);
    const rpc = vi.fn();

    vi.stubEnv("NODE_ENV", "production");
    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => ({ eval: evalMock, ttl: ttlMock }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ rpc }),
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const first = await checkRateLimit({ key: "redis:user:1", limit: 1, windowMs: 60_000 });
    const second = await checkRateLimit({ key: "redis:user:1", limit: 1, windowMs: 60_000 });

    expect(first).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(second).toEqual({ allowed: false, retryAfterSeconds: 17 });
    expect(evalMock).toHaveBeenCalledTimes(2);
    expect(ttlMock).toHaveBeenCalledWith("rate-limit:redis:user:1");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("falls through to supabase rpc when redis check throws", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: true, retry_after_seconds: 0 },
      error: null,
    });

    vi.stubEnv("NODE_ENV", "production");
    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => ({
        eval: vi.fn().mockRejectedValue(new Error("redis unavailable")),
        ttl: vi.fn(),
      }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ rpc }),
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const result = await checkRateLimit({ key: "redis:down", limit: 5, windowMs: 60_000 });

    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("allows traffic during the first five seconds of distributed failures", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => null,
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        rpc: vi.fn().mockRejectedValue(new Error("rpc down")),
      }),
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const result = await checkRateLimit({ key: "prod:fail-open", limit: 1, windowMs: 10_000 });

    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("falls back to in-memory limiter after supabase rpc keeps failing past fail-open window", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => null,
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        rpc: vi.fn().mockRejectedValue(new Error("rpc down")),
      }),
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const input = { key: "prod:mem-fallback", limit: 1, windowMs: 60_000 };

    await checkRateLimit(input);
    vi.advanceTimersByTime(6_000);
    const second = await checkRateLimit(input);
    const third = await checkRateLimit(input);

    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("opens the circuit breaker after repeated failures and retries supabase after cooldown", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("rpc down"));

    vi.stubEnv("NODE_ENV", "production");
    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => null,
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ rpc }),
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const input = { key: "prod:circuit-breaker", limit: 10, windowMs: 60_000 };

    await checkRateLimit(input);
    vi.advanceTimersByTime(6_000);
    await checkRateLimit(input);
    await checkRateLimit(input);
    expect(rpc).toHaveBeenCalledTimes(3);

    await checkRateLimit(input);
    expect(rpc).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(31_000);
    await checkRateLimit(input);
    expect(rpc).toHaveBeenCalledTimes(4);
  });

  it("cleans up expired in-memory entries during fallback sweeps", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => null,
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        rpc: vi.fn().mockRejectedValue(new Error("rpc down")),
      }),
    }));

    globalThis.__saasStarterRateLimitStore = new Map([
      ["expired", { count: 3, resetAt: Date.now() - 1_000 }],
      ["alive", { count: 1, resetAt: Date.now() + 60_000 }],
    ]);
    globalThis.__saasStarterRateLimitLastSweepAt = 0;
    vi.advanceTimersByTime(31_000);

    const { checkRateLimit } = await import("./rate-limit");
    await checkRateLimit({ key: "new", limit: 10, windowMs: 60_000 });

    expect(globalThis.__saasStarterRateLimitStore?.has("expired")).toBe(false);
    expect(globalThis.__saasStarterRateLimitStore?.has("alive")).toBe(true);
  });

  it("evicts overflow entries when in-memory fallback exceeds max capacity", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => null,
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        rpc: vi.fn().mockRejectedValue(new Error("rpc down")),
      }),
    }));

    const hugeStore = new Map<string, { count: number; resetAt: number }>();
    const now = Date.now();
    for (let idx = 0; idx < 10_002; idx += 1) {
      hugeStore.set(`k-${idx}`, { count: 1, resetAt: now + 60_000 });
    }
    globalThis.__saasStarterRateLimitStore = hugeStore;
    globalThis.__saasStarterRateLimitLastSweepAt = 0;
    vi.advanceTimersByTime(31_000);

    const { checkRateLimit } = await import("./rate-limit");
    await checkRateLimit({ key: "overflow-key", limit: 10, windowMs: 60_000 });

    expect(globalThis.__saasStarterRateLimitStore?.size).toBeLessThanOrEqual(10_001);
  });

  it("resets the in-memory window after expiration", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.doMock("@/lib/redis/client", () => ({
      getRedisClient: () => null,
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        rpc: vi.fn().mockRejectedValue(new Error("rpc down")),
      }),
    }));

    const { checkRateLimit } = await import("./rate-limit");
    const options = { key: "window-reset", limit: 1, windowMs: 1_000 };

    const first = await checkRateLimit(options);
    const second = await checkRateLimit(options);
    vi.advanceTimersByTime(1_100);
    const third = await checkRateLimit(options);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(third).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });
});
