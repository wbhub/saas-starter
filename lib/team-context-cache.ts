import type { SupabaseClient } from "@supabase/supabase-js";
import { getRedisClient } from "@/lib/redis/client";
import { logger } from "@/lib/logger";
import { getTeamContextForUser, type TeamContext } from "@/lib/team-context";

const TEAM_CONTEXT_CACHE_TTL_SECONDS = 300;
const TEAM_CONTEXT_CACHE_TTL_MS = TEAM_CONTEXT_CACHE_TTL_SECONDS * 1000;
const FALLBACK_SWEEP_INTERVAL_MS = 30 * 1000;
const FALLBACK_MAX_ENTRIES = 10_000;

type TeamContextCacheEntry = {
  value: TeamContext | null;
  expiresAt: number;
};

type RedisTeamContextCacheRead =
  | {
      cacheAvailable: true;
      hit: true;
      value: TeamContext | null;
    }
  | {
      cacheAvailable: true;
      hit: false;
    }
  | {
      cacheAvailable: false;
      hit: false;
    };

declare global {
  var __saasStarterTeamContextCache: Map<string, TeamContextCacheEntry> | undefined;
  var __saasStarterTeamContextCacheLastSweepAt: number | undefined;
}

function getInMemoryTeamContextCache() {
  if (!globalThis.__saasStarterTeamContextCache) {
    globalThis.__saasStarterTeamContextCache = new Map();
  }

  return globalThis.__saasStarterTeamContextCache;
}

function getCacheKey(userId: string) {
  return `team-context:${userId}`;
}

function trimOverflowEntries(cache: Map<string, TeamContextCacheEntry>) {
  if (cache.size <= FALLBACK_MAX_ENTRIES) {
    return;
  }

  const overflow = cache.size - FALLBACK_MAX_ENTRIES;
  let removed = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    removed += 1;
    if (removed >= overflow) {
      break;
    }
  }
}

function cleanupInMemoryCache(cache: Map<string, TeamContextCacheEntry>, now: number) {
  const lastSweepAt = globalThis.__saasStarterTeamContextCacheLastSweepAt ?? 0;
  if (now - lastSweepAt >= FALLBACK_SWEEP_INTERVAL_MS) {
    globalThis.__saasStarterTeamContextCacheLastSweepAt = now;
    for (const [key, value] of cache.entries()) {
      if (value.expiresAt <= now) {
        cache.delete(key);
      }
    }
  }

  trimOverflowEntries(cache);
}

function readInMemoryCache(userId: string): TeamContext | null | undefined {
  const cache = getInMemoryTeamContextCache();
  const now = Date.now();
  cleanupInMemoryCache(cache, now);
  const key = getCacheKey(userId);
  const entry = cache.get(key);
  if (!entry) {
    return undefined;
  }

  if (entry.expiresAt <= now) {
    cache.delete(key);
    return undefined;
  }

  // LRU touch: move to end of Map iteration order so eviction targets least-recently-used
  cache.delete(key);
  cache.set(key, entry);

  return entry.value;
}

function writeInMemoryCache(userId: string, value: TeamContext | null) {
  const cache = getInMemoryTeamContextCache();
  const now = Date.now();
  cleanupInMemoryCache(cache, now);
  cache.set(getCacheKey(userId), {
    value,
    expiresAt: now + TEAM_CONTEXT_CACHE_TTL_MS,
  });
  trimOverflowEntries(cache);
}

async function readRedisCache(userId: string): Promise<RedisTeamContextCacheRead> {
  const redis = getRedisClient();
  if (!redis) {
    return {
      cacheAvailable: false,
      hit: false,
    };
  }

  const raw = await redis.get<string | TeamContext | null>(getCacheKey(userId));
  if (raw === null || raw === undefined) {
    return {
      cacheAvailable: true,
      hit: false,
    };
  }

  if (typeof raw === "object") {
    return {
      cacheAvailable: true,
      hit: true,
      value: raw,
    };
  }

  try {
    return {
      cacheAvailable: true,
      hit: true,
      value: JSON.parse(raw) as TeamContext | null,
    };
  } catch {
    return {
      cacheAvailable: true,
      hit: false,
    };
  }
}

async function writeRedisCache(userId: string, value: TeamContext | null) {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  await redis.set(getCacheKey(userId), value, {
    ex: TEAM_CONTEXT_CACHE_TTL_SECONDS,
  });
}

export async function getCachedTeamContextForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<TeamContext | null> {
  try {
    const redisCached = await readRedisCache(userId);
    if (redisCached.hit) {
      writeInMemoryCache(userId, redisCached.value);
      return redisCached.value;
    }

    if (!redisCached.cacheAvailable) {
      const inMemoryCached = readInMemoryCache(userId);
      if (inMemoryCached !== undefined) {
        return inMemoryCached;
      }
    }
  } catch (error) {
    logger.warn("Failed to read team context cache from redis; continuing.", {
      userId,
      error,
    });

    const inMemoryCached = readInMemoryCache(userId);
    if (inMemoryCached !== undefined) {
      return inMemoryCached;
    }
  }

  const teamContext = await getTeamContextForUser(supabase, userId);
  writeInMemoryCache(userId, teamContext);

  try {
    await writeRedisCache(userId, teamContext);
  } catch (error) {
    logger.warn("Failed to write team context cache to redis; continuing.", {
      userId,
      error,
    });
  }

  return teamContext;
}

export async function invalidateCachedTeamContextForUser(userId: string) {
  const cacheKey = getCacheKey(userId);
  getInMemoryTeamContextCache().delete(cacheKey);
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  try {
    await redis.del(cacheKey);
  } catch (error) {
    logger.warn("Failed to invalidate team context cache from redis; continuing.", {
      userId,
      error,
    });
  }
}
