import { Router, type Response } from 'express'
import { db, type Membership } from '../store.js'
import type { AuthedRequest } from '../middleware/auth.js'

const router = Router()

const ROLES: Membership['role'][] = [
  'platform_admin',
  'tenant_admin',
  'developer',
  'operator',
  'agent',
]

async function requireAdmin(req: AuthedRequest, res: Response): Promise<boolean> {
  const role = await db.getMembershipRole(req.auth!.userId, req.auth!.tenantId)
  if (role !== 'tenant_admin' && role !== 'platform_admin') {
    res.status(403).json({ success: false, error: '需要管理员权限' })
    return false
  }
  return true
}

router.get('/members', async (req: AuthedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return
  const list = await db.listTenantMembers(req.auth!.tenantId)
  res.json({ success: true, data: list })
})

router.post('/members', async (req: AuthedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return
  const tenantId = req.auth!.tenantId
  const { email, password, role } = (req.body ?? {}) as {
    email?: string
    password?: string
    role?: Membership['role']
  }
  const e = String(email ?? '').trim()
  const p = String(password ?? '')
  if (!e || !p || !role || !ROLES.includes(role)) {
    res.status(400).json({ success: false, error: '邮箱、密码、角色必填' })
    return
  }
  try {
    const member = await db.createTenantMember(tenantId, e, p, role)
    await db.insertAuditLog({
      tenantId,
      userId: req.auth!.userId,
      action: 'member.create',
      resourceType: 'membership',
      resourceId: member.membershipId,
      detail: { email: e, role },
    })
    res.status(201).json({ success: true, data: member })
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
})

router.patch('/members/:id', async (req: AuthedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return
  const { role } = (req.body ?? {}) as { role?: Membership['role'] }
  if (!role || !ROLES.includes(role)) {
    res.status(400).json({ success: false, error: '无效角色' })
    return
  }
  const ok = await db.updateMemberRole(req.auth!.tenantId, req.params.id, role)
  if (!ok) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true })
})

router.delete('/members/:id', async (req: AuthedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return
  const ok = await db.deleteTenantMember(req.auth!.tenantId, req.params.id)
  if (!ok) {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }
  res.json({ success: true })
})

router.get('/audit', async (req: AuthedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return
  const list = await db.listAuditLogs(req.auth!.tenantId)
  res.json({ success: true, data: list })
})

export default router
