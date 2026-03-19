import { createAdminClient } from "@/lib/supabase/admin";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const PRODUCTION_FALLBACK_RETRY_AFTER_SECONDS = 60;

type InMemoryRateLimitRecord = {
  count: number;
  resetAt: number;
};

type InMemoryRateLimitStore = Map<string, InMemoryRateLimitRecord>;

const FALLBACK_SWEEP_INTERVAL_MS = 30 * 1000;
const FALLBACK_MAX_ENTRIES = 10_000;

declare global {
  var __saasStarterRateLimitStore: InMemoryRateLimitStore | undefined;
  var __saasStarterRateLimitLastSweepAt: number | undefined;
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

function fallbackCheckRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): RateLimitResult {
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

export async function checkRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): Promise<RateLimitResult> {
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
    if (
      row &&
      typeof row.allowed === "boolean" &&
      typeof row.retry_after_seconds === "number"
    ) {
      return {
        allowed: row.allowed,
        retryAfterSeconds: Math.max(0, Math.floor(row.retry_after_seconds)),
      };
    }
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      // Fail closed in production to avoid silently weakening rate limits.
      console.error("Distributed rate limit check failed; denying request in production", error);
      return {
        allowed: false,
        retryAfterSeconds: PRODUCTION_FALLBACK_RETRY_AFTER_SECONDS,
      };
    }

    console.error("Distributed rate limit check failed, using development fallback", error);
  }

  return fallbackCheckRateLimit({ key, limit, windowMs });
}

