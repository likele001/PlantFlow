import { Router, type Response } from 'express'
import { db } from '../store.js'
import { syncWorkflowTriggers } from '../engine/executor.js'
import { reloadCronSchedules } from '../engine/scheduler.js'
import type { WorkflowDefinition } from '../engine/types.js'
import type { AuthedRequest } from '../middleware/auth.js'

const router = Router()

router.get('/', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth?.tenantId
  if (!tenantId) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  const list = await db.listWorkflows(tenantId)
  res.status(200).json({ success: true, data: list })
})

router.post('/', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth?.tenantId
  if (!tenantId) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  const { name } = (req.body ?? {}) as { name?: string }
  if (!name || !name.trim()) {
    res.status(400).json({ success: false, error: 'Missing name' })
    return
  }

  const item = await db.createWorkflow(tenantId, name.trim())
  res.status(201).json({ success: true, data: item })
})

router.get('/:id', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth?.tenantId
  if (!tenantId) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  const item = await db.findWorkflowWithDefinition(tenantId, req.params.id)
  if (!item) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  res.status(200).json({ success: true, data: item })
})

router.patch('/:id', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const { name, definition } = (req.body ?? {}) as {
    name?: string
    definition?: WorkflowDefinition
  }
  const patch: Parameters<typeof db.updateWorkflow>[2] = {}
  if (name !== undefined) patch.name = String(name).trim()
  if (definition !== undefined) patch.definition = definition

  const updated = await db.updateWorkflow(tenantId, req.params.id, patch)
  if (!updated) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  await db.insertAuditLog({
    tenantId,
    userId: req.auth!.userId,
    action: 'workflow.update',
    resourceType: 'workflow',
    resourceId: req.params.id,
  })
  res.json({ success: true, data: updated })
})

router.post('/:id/publish', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const wf = await db.findWorkflowWithDefinition(tenantId, req.params.id)
  if (!wf) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  if (!wf.definition?.nodes?.length) {
    res.status(400).json({ success: false, error: '工作流至少需要一个节点' })
    return
  }
  const def = wf.definition ?? { nodes: [], edges: [] }
  const version = await db.getNextWorkflowVersion(req.params.id)
  await db.createWorkflowVersion({
    tenantId,
    workflowId: req.params.id,
    version,
    definition: def,
    note: `发布 v${version}`,
    createdBy: req.auth!.userId,
  })
  const updated = await db.updateWorkflow(tenantId, req.params.id, { status: 'published' })
  await syncWorkflowTriggers(tenantId, req.params.id, def)
  void reloadCronSchedules()
  await db.insertAuditLog({
    tenantId,
    userId: req.auth!.userId,
    action: 'workflow.publish',
    resourceType: 'workflow',
    resourceId: req.params.id,
    detail: { version },
  })
  res.json({ success: true, data: { ...updated, publishedVersion: version } })
})

router.get('/:id/versions', async (req: AuthedRequest, res: Response) => {
  const list = await db.listWorkflowVersions(req.auth!.tenantId, req.params.id)
  res.json({ success: true, data: list })
})

router.post('/:id/rollback/:versionId', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const ver = await db.findWorkflowVersion(tenantId, req.params.versionId)
  if (!ver || ver.workflowId !== req.params.id) {
    res.status(404).json({ success: false, error: '版本不存在' })
    return
  }
  const def = ver.definition as WorkflowDefinition
  const updated = await db.updateWorkflow(tenantId, req.params.id, { definition: def })
  await syncWorkflowTriggers(tenantId, req.params.id, def)
  void reloadCronSchedules()
  await db.insertAuditLog({
    tenantId,
    userId: req.auth!.userId,
    action: 'workflow.rollback',
    resourceType: 'workflow',
    resourceId: req.params.id,
    detail: { version: ver.version, versionId: ver.id },
  })
  res.json({ success: true, data: updated })
})

router.delete('/:id', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const ok = await db.deleteWorkflow(tenantId, req.params.id)
  if (!ok) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  await db.clearWorkflowTriggers(tenantId, req.params.id)
  void reloadCronSchedules()
  await db.insertAuditLog({
    tenantId,
    userId: req.auth!.userId,
    action: 'workflow.delete',
    resourceType: 'workflow',
    resourceId: req.params.id,
  })
  res.json({ success: true })
})

router.post('/:id/run', async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const wf = await db.findWorkflowWithDefinition(tenantId, req.params.id)
  if (!wf) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  const body = (req.body ?? {}) as { triggerData?: Record<string, unknown> }
  const triggerData = body.triggerData ?? {
    type: 'manual',
    content: '手动测试触发',
    channel: 'manual',
    fromId: req.auth!.userId,
  }
  const job = await db.enqueueExecutionJob({
    tenantId,
    workflowId: wf.id,
    triggerType: 'trigger.manual',
    triggerData,
    userId: req.auth!.userId,
  })
  res.status(202).json({
    success: true,
    data: { jobId: job.id, message: '已加入执行队列，请在执行中心查看结果' },
  })
})

export default router
