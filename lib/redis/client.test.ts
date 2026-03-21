import { beforeEach, describe, expect, it, vi } from "vitest";

describe("getRedisClient", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns null when Upstash credentials are missing", async () => {
    const redisConstructor = vi.fn();

    vi.doMock("@upstash/redis", () => ({
      Redis: redisConstructor,
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        UPSTASH_REDIS_REST_URL: undefined,
        UPSTASH_REDIS_REST_TOKEN: undefined,
      },
    }));

    const { getRedisClient } = await import("./client");
    expect(getRedisClient()).toBeNull();
    expect(getRedisClient()).toBeNull();
    expect(redisConstructor).not.toHaveBeenCalled();
  });

  it("memoizes the Redis client when credentials exist", async () => {
    const redisInstance = { kind: "redis" };
    const redisConstructor = vi.fn(function RedisMock(this: Record<string, unknown>) {
      Object.assign(this, redisInstance);
    });

    vi.doMock("@upstash/redis", () => ({
      Redis: redisConstructor,
    }));
    vi.doMock("@/lib/env", () => ({
      env: {
        UPSTASH_REDIS_REST_URL: "https://upstash.example",
        UPSTASH_REDIS_REST_TOKEN: "token-123",
      },
    }));

    const { getRedisClient } = await import("./client");
    const first = getRedisClient();
    const second = getRedisClient();

    expect(first).toMatchObject(redisInstance);
    expect(second).toBe(first);
    expect(redisConstructor).toHaveBeenCalledTimes(1);
    expect(redisConstructor).toHaveBeenCalledWith({
      url: "https://upstash.example",
      token: "token-123",
    });
  });
});
