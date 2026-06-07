import { createClient, type RedisClientType } from 'redis'

let client: RedisClientType | null = null
let connectFailed = false

export function getRedisUrl(): string | null {
  const url = process.env.REDIS_URL?.trim()
  if (!url) return null
  // Inside Docker, 127.0.0.1 points to the container — use host gateway instead
  if (url.includes('127.0.0.1') || url.includes('localhost')) {
    return url.replace('127.0.0.1', 'host.docker.internal').replace('localhost', 'host.docker.internal')
  }
  return url
}

export async function getRedis(): Promise<RedisClientType | null> {
  if (connectFailed) return null
  const url = getRedisUrl()
  if (!url) return null
  if (client?.isOpen) return client

  try {
    const c = createClient({
      url,
      socket: {
        connectTimeout: 2000,
        reconnectStrategy: () => false,
      },
    })
    c.on('error', () => {})
    await c.connect()
    client = c as RedisClientType
    return client
  } catch {
    connectFailed = true
    return null
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    const r = await getRedis()
    if (!r) return false
    const pong = await Promise.race([
      r.ping(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
    ])
    return pong === 'PONG'
  } catch {
    return false
  }
}

export const EXECUTION_QUEUE_KEY = 'execution:pending'

export async function redisPushJob(jobId: string): Promise<void> {
  const r = await getRedis()
  if (!r) return
  try {
    await r.lPush(EXECUTION_QUEUE_KEY, jobId)
  } catch { /* fallback PG poll */ }
}

export async function redisPopJob(): Promise<string | null> {
  const r = await getRedis()
  if (!r) return null
  try {
    return await r.rPop(EXECUTION_QUEUE_KEY)
  } catch {
    return null
  }
}

export async function redisQueueLength(): Promise<number> {
  const r = await getRedis()
  if (!r) return 0
  try {
    return await r.lLen(EXECUTION_QUEUE_KEY)
  } catch {
    return 0
  }
}

export async function rateLimitCheck(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ ok: boolean; count: number }> {
  const r = await getRedis()
  if (!r) return { ok: true, count: 0 }
  try {
    const redisKey = `ratelimit:${key}`
    const count = await r.incr(redisKey)
    if (count === 1) await r.expire(redisKey, windowSec)
    return { ok: count <= limit, count }
  } catch {
    return { ok: true, count: 0 }
  }
}
