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
