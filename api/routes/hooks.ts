import { Router, type Request, type Response } from 'express'
import { db } from '../store.js'

const router = Router()

router.all('/:tenantId/:path', async (req: Request, res: Response): Promise<void> => {
  const tenantId = String(req.params.tenantId ?? '').trim()
  const path = String(req.params.path ?? '').trim()
  if (!tenantId || !path) {
    res.status(400).json({ success: false, error: 'invalid hook' })
    return
  }

  const match = await db.findWorkflowByWebhook(tenantId, path)
  if (!match) {
    res.status(404).json({ success: false, error: 'webhook not found' })
    return
  }

  const triggerData = {
    type: 'webhook',
    method: req.method,
    path,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
    },
    body: req.body,
    content: typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body ?? {}),
    receivedAt: new Date().toISOString(),
  }

  const job = await db.enqueueExecutionJob({
    tenantId,
    workflowId: match.workflowId,
    triggerType: 'trigger.webhook',
    triggerData,
  })

  res.status(202).json({
    success: true,
    data: { jobId: job.id, message: '已加入执行队列' },
  })
})

export default router
