import type { SupabaseClient } from "@supabase/supabase-js";
import { getRedisClient } from "@/lib/redis/client";
import { logger } from "@/lib/logger";
import { getTeamContextForUser, type TeamContext } from "@/lib/team-context";

const TEAM_CONTEXT_CACHE_TTL_SECONDS = 30;
const TEAM_CONTEXT_CACHE_TTL_MS = TEAM_CONTEXT_CACHE_TTL_SECONDS * 1000;

type TeamContextCacheEntry = {
  value: TeamContext | null;
  expiresAt: number;
};

declare global {
  var __saasStarterTeamContextCache: Map<string, TeamContextCacheEntry> | undefined;
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

function readInMemoryCache(userId: string): TeamContext | null | undefined {
  const cache = getInMemoryTeamContextCache();
  const entry = cache.get(getCacheKey(userId));
  if (!entry) {
    return undefined;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(getCacheKey(userId));
    return undefined;
  }

  return entry.value;
}

function writeInMemoryCache(userId: string, value: TeamContext | null) {
  const cache = getInMemoryTeamContextCache();
  cache.set(getCacheKey(userId), {
    value,
    expiresAt: Date.now() + TEAM_CONTEXT_CACHE_TTL_MS,
  });
}

async function readRedisCache(userId: string): Promise<TeamContext | null | undefined> {
  const redis = getRedisClient();
  if (!redis) {
    return undefined;
  }

  const raw = await redis.get<string>(getCacheKey(userId));
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as TeamContext | null;
  } catch {
    return undefined;
  }
}

async function writeRedisCache(userId: string, value: TeamContext | null) {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  await redis.set(getCacheKey(userId), JSON.stringify(value), {
    ex: TEAM_CONTEXT_CACHE_TTL_SECONDS,
  });
}

export async function getCachedTeamContextForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<TeamContext | null> {
  try {
    const redisCached = await readRedisCache(userId);
    if (redisCached !== undefined) {
      return redisCached;
    }
  } catch (error) {
    logger.warn("Failed to read team context cache from redis; using in-memory fallback.", {
      userId,
      error,
    });
  }

  const inMemoryCached = readInMemoryCache(userId);
  if (inMemoryCached !== undefined) {
    return inMemoryCached;
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

export function invalidateCachedTeamContextForUser(userId: string) {
  getInMemoryTeamContextCache().delete(getCacheKey(userId));
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  void redis.del(getCacheKey(userId));
}
