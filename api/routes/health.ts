import { Router, type Request, type Response } from 'express'
import { pool } from '../db.js'
import { pingRedis, redisQueueLength } from '../redis.js'

const router = Router()

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  let dbOk = false
  let redisOk = false
  let queuePending = 0

  try {
    await pool.query('SELECT 1')
    dbOk = true
  } catch { /* db down */ }

  redisOk = await pingRedis()
  if (redisOk) {
    try {
      queuePending = await redisQueueLength()
    } catch { /* ignore */ }
  } else {
    try {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM execution_jobs WHERE status = 'pending'`,
      )
      queuePending = Number(rows[0]?.count ?? 0)
    } catch { /* ignore */ }
  }

  const ok = dbOk
  res.status(ok ? 200 : 503).json({
    success: ok,
    message: ok ? 'ok' : 'degraded',
    checks: {
      database: dbOk,
      redis: redisOk,
      queuePending,
    },
  })
})

export default router
