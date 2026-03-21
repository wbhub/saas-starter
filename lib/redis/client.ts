import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let redisClient: Redis | null | undefined;

export function getRedisClient(): Redis | null {
  if (redisClient !== undefined) {
    return redisClient;
  }

  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  return redisClient;
}
