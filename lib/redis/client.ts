import { Redis } from '@upstash/redis'

export const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null

export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  if (!redis) {
    // If Redis is not configured, allow all requests (dev mode)
    return { allowed: true, remaining: maxAttempts }
  }

  const count = await redis.incr(key)

  if (count === 1) {
    await redis.expire(key, windowSeconds)
  }

  const allowed = count <= maxAttempts
  const remaining = Math.max(0, maxAttempts - count)

  return { allowed, remaining }
}

export async function resetRateLimit(key: string): Promise<void> {
  if (!redis) return
  await redis.del(key)
}
