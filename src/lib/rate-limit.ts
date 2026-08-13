import { NextRequest } from 'next/server';
import Redis from 'ioredis';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const globalRateLimits = globalThis as unknown as {
  rateLimits?: Map<string, RateLimitEntry>;
  rateLimitRedis?: Redis;
};

const store = globalRateLimits.rateLimits ?? new Map<string, RateLimitEntry>();
globalRateLimits.rateLimits = store;

const redisUrl = process.env.REDIS_URL?.trim();
const redis = redisUrl
  ? globalRateLimits.rateLimitRedis ??
    new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 1_500,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    })
  : null;
if (redis) {
  redis.on('error', () => {
    // The in-memory limiter below remains available if Redis is unreachable.
  });
  globalRateLimits.rateLimitRedis = redis;
}

export function requestClientIp(req: Request | NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip')?.trim() || 'unknown';
}

function checkMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
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
  current.count++;
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  if (redis) {
    try {
      const redisKey = `ausbildung-finder:rate-limit:${key}`;
      const result = await redis.eval(
        `local count = redis.call('INCR', KEYS[1])
         if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         local ttl = redis.call('PTTL', KEYS[1])
         return {count, ttl}`,
        1,
        redisKey,
        String(windowMs)
      ) as [number, number];
      const count = Number(result[0]);
      const ttlMs = Math.max(0, Number(result[1]));
      return {
        allowed: count <= limit,
        retryAfterSeconds: count <= limit ? 0 : Math.max(1, Math.ceil(ttlMs / 1000)),
      };
    } catch {
      // A Redis outage must not take authentication or search offline.
    }
  }
  return checkMemoryRateLimit(key, limit, windowMs);
}

export async function clearRateLimit(key: string) {
  store.delete(key);
  if (redis) {
    await redis.del(`ausbildung-finder:rate-limit:${key}`).catch(() => {});
  }
}
