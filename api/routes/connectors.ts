import { Router, type Response } from 'express'
import { db, type Connector } from '../store.js'
import type { AuthedRequest } from '../middleware/auth.js'

const router = Router()

const TYPES: Connector['type'][] = ['http', 'database', 'wecom', 'feishu', 'custom']

router.get('/', async (req: AuthedRequest, res: Response) => {
  const list = await db.listConnectors(req.auth!.tenantId)
  res.json({ success: true, data: list })
})

router.post('/', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const { name, type, config } = (req.body ?? {}) as {
    name?: string
    type?: Connector['type']
    config?: Record<string, unknown>
  }
  const n = String(name ?? '').trim()
  if (!n || !type || !TYPES.includes(type)) {
    res.status(400).json({ success: false, error: '名称与类型必填' })
    return
  }
  const item = await db.createConnector(tenantId, n, type, config ?? {})
  await db.insertAuditLog({
    tenantId,
    userId: req.auth!.userId,
    action: 'connector.create',
    resourceType: 'connector',
    resourceId: item.id,
  })
  res.status(201).json({ success: true, data: item })
})

router.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const { name, config } = (req.body ?? {}) as {
    name?: string
    config?: Record<string, unknown>
  }
  const updated = await db.updateConnector(tenantId, req.params.id, { name, config })
  if (!updated) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true, data: updated })
})

router.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const ok = await db.deleteConnector(tenantId, req.params.id)
  if (!ok) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true })
})

export default router
