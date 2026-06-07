import { Router, type Response } from 'express'
import { db } from '../store.js'
import type { AuthedRequest } from '../middleware/auth.js'

const router = Router()

router.get('/', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const workflowId = typeof req.query.workflowId === 'string' ? req.query.workflowId : undefined
  const status = typeof req.query.status === 'string' ? req.query.status : undefined
  const list = await db.listExecutions(tenantId, { workflowId, status })
  res.json({ success: true, data: list })
})

router.get('/:id', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const item = await db.findExecution(tenantId, req.params.id)
  if (!item) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  const steps = await db.listExecutionSteps(item.id)
  res.json({ success: true, data: { ...item, steps } })
})

router.get('/jobs/:jobId', async (req: AuthedRequest, res: Response): Promise<void> => {
  const job = await db.findExecutionJob(req.auth!.tenantId, req.params.jobId)
  if (!job) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true, data: job })
})

router.post('/:id/cancel', async (req: AuthedRequest, res: Response): Promise<void> => {
  const ok = await db.cancelExecution(req.auth!.tenantId, req.params.id)
  if (!ok) {
    res.status(400).json({ success: false, error: '无法取消（可能已结束）' })
    return
  }
  res.json({ success: true })
})

router.post('/:id/retry', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const item = await db.findExecution(tenantId, req.params.id)
  if (!item) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  const triggerData =
    item.triggerData && typeof item.triggerData === 'object'
      ? (item.triggerData as Record<string, unknown>)
      : {}
  const job = await db.enqueueExecutionJob({
    tenantId,
    workflowId: item.workflowId,
    triggerType: item.triggerType,
    triggerData,
    userId: req.auth!.userId,
  })
  await db.insertAuditLog({
    tenantId,
    userId: req.auth!.userId,
    action: 'execution.retry',
    resourceType: 'execution',
    resourceId: item.id,
    detail: { jobId: job.id },
  })
  res.json({ success: true, data: { jobId: job.id } })
})

export default router
