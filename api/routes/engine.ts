import { Router, type Response } from 'express'
import { getAllNodeRegistry } from '../engine/plugins.js'
import type { AuthedRequest } from '../middleware/auth.js'

const router = Router()

router.get('/nodes', (_req: AuthedRequest, res: Response): void => {
  res.json({ success: true, data: getAllNodeRegistry() })
})

export default router
