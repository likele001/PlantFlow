import { Router, type Response } from 'express'
import { db } from '../store.js'
import type { AuthedRequest } from '../middleware/auth.js'

const router = Router()

router.get('/', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth?.tenantId
  if (!tenantId) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  const tenants = await db.listTenantsForUser(req.auth!.userId)
  const tenant = tenants.find((t) => t.id === tenantId)
  if (!tenant) {
    res.status(404).json({ success: false, error: 'Tenant not found' })
    return
  }

  res.status(200).json({ success: true, data: [tenant] })
})

export default router
