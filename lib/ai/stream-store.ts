import "server-only";
import { env } from "@/lib/env";
import { getRedisClient } from "@/lib/redis/client";
import { logger } from "@/lib/logger";

const STREAM_TTL_SECONDS = 3600; // 1 hour
const STREAM_KEY_PREFIX = "ai:stream:";

/**
 * Redis-backed stream store for resumable AI streams.
 *
 * Requires:
 * - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars
 * - `AI_RESUMABLE_STREAMS_ENABLED=true` env var
 *
 * Each stream is stored as a Redis key with a JSON array of chunks.
 * Streams expire after 1 hour to prevent unbounded storage growth.
 */
export function isResumableStreamsEnabled(): boolean {
  return env.AI_RESUMABLE_STREAMS_ENABLED && getRedisClient() !== null;
}

export async function saveStreamChunk(streamId: string, chunk: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    const key = `${STREAM_KEY_PREFIX}${streamId}`;
    await redis.rpush(key, chunk);
    await redis.expire(key, STREAM_TTL_SECONDS);
  } catch (error) {
    logger.error("Failed to save stream chunk to Redis", error, { streamId });
  }
}

export async function loadStreamChunks(streamId: string): Promise<string[]> {
  const redis = getRedisClient();
  if (!redis) return [];

  try {
    const key = `${STREAM_KEY_PREFIX}${streamId}`;
    const chunks = await redis.lrange(key, 0, -1);
    return chunks.map(String);
  } catch (error) {
    logger.error("Failed to load stream chunks from Redis", error, { streamId });
    return [];
  }
}

export async function deleteStream(streamId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.del(`${STREAM_KEY_PREFIX}${streamId}`);
  } catch (error) {
    logger.error("Failed to delete stream from Redis", error, { streamId });
  }
}

export function generateStreamId(threadId: string, messageIndex: number): string {
  return `${threadId}:${messageIndex}`;
}
