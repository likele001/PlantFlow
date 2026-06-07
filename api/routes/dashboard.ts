import { Router, type Response } from 'express'
import { db } from '../store.js'
import type { AuthedRequest } from '../middleware/auth.js'

const router = Router()

router.get('/stats', async (req: AuthedRequest, res: Response) => {
  const stats = await db.getDashboardStats(req.auth!.tenantId)
  res.json({ success: true, data: stats })
})

export default router
