import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveDashboardTeamSnapshot,
  type DashboardTeamSnapshot,
} from "@/lib/dashboard/team-snapshot";
import { isTestEnvironment } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getRedisClient } from "@/lib/redis/client";

const DASHBOARD_TEAM_SNAPSHOT_CACHE_TTL_SECONDS = 120;
const DASHBOARD_TEAM_SNAPSHOT_CACHE_TTL_MS = DASHBOARD_TEAM_SNAPSHOT_CACHE_TTL_SECONDS * 1000;
const FALLBACK_SWEEP_INTERVAL_MS = 30 * 1000;
const FALLBACK_MAX_ENTRIES = 10_000;

type DashboardTeamSnapshotCacheEntry = {
  value: DashboardTeamSnapshot;
  expiresAt: number;
};

type RedisDashboardTeamSnapshotCacheRead =
  | {
      cacheAvailable: true;
      hit: true;
      value: DashboardTeamSnapshot;
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
  var __saasStarterDashboardTeamSnapshotCache:
    | Map<string, DashboardTeamSnapshotCacheEntry>
    | undefined;
  var __saasStarterDashboardTeamSnapshotCacheLastSweepAt: number | undefined;
}

if (isTestEnvironment()) {
  globalThis.__saasStarterDashboardTeamSnapshotCache = undefined;
  globalThis.__saasStarterDashboardTeamSnapshotCacheLastSweepAt = undefined;
}

function getInMemoryDashboardTeamSnapshotCache() {
  if (!globalThis.__saasStarterDashboardTeamSnapshotCache) {
    globalThis.__saasStarterDashboardTeamSnapshotCache = new Map();
  }

  return globalThis.__saasStarterDashboardTeamSnapshotCache;
}

function getCacheKey(teamId: string) {
  return `dashboard-team-snapshot:${teamId}`;
}

function trimOverflowEntries(cache: Map<string, DashboardTeamSnapshotCacheEntry>) {
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

function cleanupInMemoryCache(cache: Map<string, DashboardTeamSnapshotCacheEntry>, now: number) {
  const lastSweepAt = globalThis.__saasStarterDashboardTeamSnapshotCacheLastSweepAt ?? 0;
  if (now - lastSweepAt >= FALLBACK_SWEEP_INTERVAL_MS) {
    globalThis.__saasStarterDashboardTeamSnapshotCacheLastSweepAt = now;
    for (const [key, value] of cache.entries()) {
      if (value.expiresAt <= now) {
        cache.delete(key);
      }
    }
  }

  trimOverflowEntries(cache);
}

function readInMemoryCache(teamId: string): DashboardTeamSnapshot | undefined {
  const cache = getInMemoryDashboardTeamSnapshotCache();
  const now = Date.now();
  cleanupInMemoryCache(cache, now);
  const key = getCacheKey(teamId);
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

function writeInMemoryCache(teamId: string, value: DashboardTeamSnapshot) {
  const cache = getInMemoryDashboardTeamSnapshotCache();
  const now = Date.now();
  cleanupInMemoryCache(cache, now);
  cache.set(getCacheKey(teamId), {
    value,
    expiresAt: now + DASHBOARD_TEAM_SNAPSHOT_CACHE_TTL_MS,
  });
  trimOverflowEntries(cache);
}

async function readRedisCache(teamId: string): Promise<RedisDashboardTeamSnapshotCacheRead> {
  const redis = getRedisClient();
  if (!redis) {
    return {
      cacheAvailable: false,
      hit: false,
    };
  }

  const raw = await redis.get<string | DashboardTeamSnapshot | null>(getCacheKey(teamId));
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
      value: JSON.parse(raw) as DashboardTeamSnapshot,
    };
  } catch {
    return {
      cacheAvailable: true,
      hit: false,
    };
  }
}

async function writeRedisCache(teamId: string, value: DashboardTeamSnapshot) {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  await redis.set(getCacheKey(teamId), value, {
    ex: DASHBOARD_TEAM_SNAPSHOT_CACHE_TTL_SECONDS,
  });
}

export async function getCachedDashboardTeamSnapshot(
  supabase: SupabaseClient,
  teamId: string,
): Promise<DashboardTeamSnapshot> {
  try {
    const redisCached = await readRedisCache(teamId);
    if (redisCached.hit) {
      writeInMemoryCache(teamId, redisCached.value);
      return redisCached.value;
    }

    if (!redisCached.cacheAvailable) {
      const inMemoryCached = readInMemoryCache(teamId);
      if (inMemoryCached) {
        return inMemoryCached;
      }
    }
  } catch (error) {
    logger.warn("Failed to read dashboard team snapshot cache from redis; continuing.", {
      teamId,
      error,
    });

    const inMemoryCached = readInMemoryCache(teamId);
    if (inMemoryCached) {
      return inMemoryCached;
    }
  }

  const snapshot = await resolveDashboardTeamSnapshot(supabase, teamId);
  writeInMemoryCache(teamId, snapshot);

  try {
    await writeRedisCache(teamId, snapshot);
  } catch (error) {
    logger.warn("Failed to write dashboard team snapshot cache to redis; continuing.", {
      teamId,
      error,
    });
  }

  return snapshot;
}

export async function invalidateCachedDashboardTeamSnapshot(teamId: string) {
  const cacheKey = getCacheKey(teamId);
  getInMemoryDashboardTeamSnapshotCache().delete(cacheKey);
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  try {
    await redis.del(cacheKey);
  } catch (error) {
    logger.warn("Failed to invalidate dashboard team snapshot cache from redis; continuing.", {
      teamId,
      error,
    });
  }
}

export async function invalidateCachedDashboardTeamSnapshots(teamIds: Iterable<string>) {
  await Promise.all(
    Array.from(new Set(teamIds)).map((teamId) => invalidateCachedDashboardTeamSnapshot(teamId)),
  );
}
