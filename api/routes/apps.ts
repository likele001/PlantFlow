import { Router, type Response } from 'express'
import { db } from '../store.js'
import type { AuthedRequest } from '../middleware/auth.js'

const router = Router()

router.get('/', async (req: AuthedRequest, res: Response) => {
  const list = await db.listChatApps(req.auth!.tenantId)
  res.json({ success: true, data: list })
})

router.post('/', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const { name, workflowId, description } = (req.body ?? {}) as {
    name?: string
    workflowId?: string
    description?: string
  }
  const n = String(name ?? '').trim()
  if (!n || !workflowId) {
    res.status(400).json({ success: false, error: '名称与工作流必填' })
    return
  }
  const wf = await db.findWorkflow(tenantId, workflowId)
  if (!wf) {
    res.status(404).json({ success: false, error: '工作流不存在' })
    return
  }
  const app = await db.createChatApp(tenantId, n, workflowId, description?.trim())
  res.status(201).json({ success: true, data: app })
})

router.patch('/:id', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const body = (req.body ?? {}) as {
    name?: string
    description?: string
    workflowId?: string
    status?: 'draft' | 'published'
    config?: Record<string, unknown>
  }
  const updated = await db.updateChatApp(tenantId, req.params.id, body)
  if (!updated) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true, data: updated })
})

router.get('/:id/sessions', async (req: AuthedRequest, res: Response) => {
  const list = await db.listChatSessions(req.auth!.tenantId, req.params.id)
  res.json({ success: true, data: list })
})

router.get('/:id/sessions/:sessionId/messages', async (req: AuthedRequest, res: Response) => {
  const messages = await db.listChatMessages(req.params.sessionId)
  res.json({ success: true, data: messages })
})

router.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const ok = await db.deleteChatApp(req.auth!.tenantId, req.params.id)
  if (!ok) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true })
})

export default router
