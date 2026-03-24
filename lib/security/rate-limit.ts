import { createAdminClient } from "@/lib/supabase/admin";
import { SECOND_MS } from "@/lib/constants/durations";
import { getRedisClient } from "@/lib/redis/client";

export type RateLimitDescriptor = {
  key: string;
  limit: number;
  windowMs: number;
  message: string;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const PRODUCTION_FAIL_OPEN_WINDOW_MS = 5 * SECOND_MS;
const PRODUCTION_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const PRODUCTION_CIRCUIT_BREAKER_COOLDOWN_MS = 30 * SECOND_MS;
const ATOMIC_RATE_LIMIT_INCREMENT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1]))
else
  local ttl = redis.call("TTL", KEYS[1])
  if ttl < 0 then
    redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1]))
  end
end
return count
`;

type InMemoryRateLimitRecord = {
  count: number;
  resetAt: number;
};

type InMemoryRateLimitStore = Map<string, InMemoryRateLimitRecord>;
type CircuitBreakerState = {
  consecutiveFailures: number;
  firstFailureAt: number;
  openUntil: number;
};

const FALLBACK_SWEEP_INTERVAL_MS = 30 * SECOND_MS;
const FALLBACK_MAX_ENTRIES = 10_000;

declare global {
  var __saasStarterRateLimitStore: InMemoryRateLimitStore | undefined;
  var __saasStarterRateLimitLastSweepAt: number | undefined;
  var __saasStarterRateLimitCircuitBreaker: CircuitBreakerState | undefined;
}

function getStore(): InMemoryRateLimitStore {
  if (!globalThis.__saasStarterRateLimitStore) {
    globalThis.__saasStarterRateLimitStore = new Map();
  }

  return globalThis.__saasStarterRateLimitStore;
}

function cleanupExpiredEntries(store: InMemoryRateLimitStore, now: number) {
  const lastSweepAt = globalThis.__saasStarterRateLimitLastSweepAt ?? 0;
  if (now - lastSweepAt < FALLBACK_SWEEP_INTERVAL_MS) {
    return;
  }

  globalThis.__saasStarterRateLimitLastSweepAt = now;

  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) {
      store.delete(key);
    }
  }

  if (store.size <= FALLBACK_MAX_ENTRIES) {
    return;
  }

  const overflow = store.size - FALLBACK_MAX_ENTRIES;
  let removed = 0;
  for (const key of store.keys()) {
    store.delete(key);
    removed += 1;
    if (removed >= overflow) {
      break;
    }
  }
}

function getCircuitBreakerState(): CircuitBreakerState {
  if (!globalThis.__saasStarterRateLimitCircuitBreaker) {
    globalThis.__saasStarterRateLimitCircuitBreaker = {
      consecutiveFailures: 0,
      firstFailureAt: 0,
      openUntil: 0,
    };
  }

  return globalThis.__saasStarterRateLimitCircuitBreaker;
}

function resetCircuitBreaker() {
  const state = getCircuitBreakerState();
  state.consecutiveFailures = 0;
  state.firstFailureAt = 0;
  state.openUntil = 0;
}

function fallbackCheckRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const store = getStore();

  cleanupExpiredEntries(store, now);

  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  store.set(key, { ...current, count: current.count + 1 });
  return { allowed: true, retryAfterSeconds: 0 };
}

async function redisCheckRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): Promise<RateLimitResult> {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error("Redis is not configured");
  }

  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const redisKey = `rate-limit:${key}`;
  const count = await redis.eval<[string], number>(
    ATOMIC_RATE_LIMIT_INCREMENT_SCRIPT,
    [redisKey],
    [String(windowSeconds)],
  );

  if (count > limit) {
    const ttlSeconds = await redis.ttl(redisKey);
    const retryAfterSeconds = ttlSeconds > 0 ? ttlSeconds : windowSeconds;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export async function checkRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): Promise<RateLimitResult> {
  const isProduction = process.env.NODE_ENV === "production";
  const now = Date.now();
  const circuitBreaker = getCircuitBreakerState();
  const redis = getRedisClient();

  if (redis) {
    try {
      return await redisCheckRateLimit({ key, limit, windowMs });
    } catch (error) {
      if (isProduction) {
        console.error("Redis rate limit check failed; using existing fallback path", error);
      } else {
        console.error("Redis rate limit check failed in development", error);
      }
    }
  }

  if (isProduction && circuitBreaker.openUntil > now) {
    return fallbackCheckRateLimit({ key, limit, windowMs });
  }

  try {
    const supabase = createAdminClient();
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row.allowed === "boolean" && typeof row.retry_after_seconds === "number") {
      if (isProduction) {
        resetCircuitBreaker();
      }
      return {
        allowed: row.allowed,
        retryAfterSeconds: Math.max(0, Math.floor(row.retry_after_seconds)),
      };
    }
  } catch (error) {
    if (isProduction) {
      const state = getCircuitBreakerState();
      state.consecutiveFailures += 1;
      if (state.consecutiveFailures === 1) {
        state.firstFailureAt = now;
      }

      const failOpenWindowActive = now - state.firstFailureAt <= PRODUCTION_FAIL_OPEN_WINDOW_MS;
      if (
        state.consecutiveFailures >= PRODUCTION_CIRCUIT_BREAKER_FAILURE_THRESHOLD &&
        !failOpenWindowActive
      ) {
        state.openUntil = now + PRODUCTION_CIRCUIT_BREAKER_COOLDOWN_MS;
      }

      if (failOpenWindowActive) {
        console.error(
          "Distributed rate limit check failed; temporarily allowing traffic while fail-open window is active",
          error,
        );
        return { allowed: true, retryAfterSeconds: 0 };
      }

      console.error(
        "Distributed rate limit check failed in production; using in-memory fallback",
        error,
      );
      return fallbackCheckRateLimit({ key, limit, windowMs });
    }

    console.error("Distributed rate limit check failed, using development fallback", error);
  }

  return fallbackCheckRateLimit({ key, limit, windowMs });
}
