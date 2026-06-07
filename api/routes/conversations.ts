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

  const list = await db.listConversations(tenantId)
  res.status(200).json({ success: true, data: list })
})

router.get('/:id/messages', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const messages = await db.listMessages(tenantId, req.params.id)
  res.json({ success: true, data: messages })
})

router.post('/:id/reply', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const { content } = (req.body ?? {}) as { content?: string }
  const text = String(content ?? '').trim()
  if (!text) {
    res.status(400).json({ success: false, error: '内容必填' })
    return
  }
  const msg = await db.insertMessage(
    tenantId,
    req.params.id,
    'out',
    req.auth!.userId,
    text,
    { manual: true },
    '客服',
  )
  res.json({ success: true, data: msg })
})

router.patch('/:id/status', async (req: AuthedRequest, res: Response): Promise<void> => {
  const { status } = (req.body ?? {}) as { status?: 'open' | 'pending' | 'resolved' }
  if (!status) {
    res.status(400).json({ success: false, error: 'status 必填' })
    return
  }
  const ok = await db.updateConversationStatus(req.auth!.tenantId, req.params.id, status)
  if (!ok) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true })
})

export default router
