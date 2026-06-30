import { Router, type Response } from 'express'
import { db } from '../store.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

const router = Router()

router.get('/', async (req: AuthedRequest, res: Response): Promise<void> => {
  const { pool } = await import('../db.js')
  const role = await db.getMembershipRole(req.auth!.userId, req.auth!.tenantId)
  if (role === 'platform_admin') {
    const { rows } = await pool.query<{ id: string; name: string; created_at: string }>(
      `SELECT id, name, created_at AS "createdAt" FROM tenants ORDER BY created_at DESC`
    )
    res.json({ success: true, data: rows.map(r => ({ id: r.id, name: r.name, createdAt: r.created_at })) })
    return
  }
  const tenants = await db.listTenantsForUser(req.auth!.userId)
  res.json({ success: true, data: tenants })
})

router.post('/', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { name, adminEmail, adminPassword } = (req.body ?? {}) as {
    name?: string; adminEmail?: string; adminPassword?: string
  }
  const n = String(name ?? '').trim()
  const email = String(adminEmail ?? '').trim().toLowerCase()
  const pw = String(adminPassword ?? '')

  if (!n || !email || !pw) {
    res.status(400).json({ success: false, error: 'name / adminEmail / adminPassword 必填' })
    return
  }
  if (pw.length < 6) {
    res.status(400).json({ success: false, error: '密码至少6位' })
    return
  }

  try {
    const tenant = await db.createTenant(n)
    const hashed = await db.hashPassword(pw)
    let user = await db.findUserByEmail(email)
    if (!user) {
      user = await db.createUser(email, hashed)
    }
    await db.createMembership({ tenantId: tenant.id, userId: user.id, role: 'tenant_admin' })

    res.status(201).json({
      success: true,
      data: {
        tenant: { id: tenant.id, name: tenant.name },
        adminUser: { id: user.id, email: user.email },
        loginUrl: 'https://api.user.023ent.net/login',
      },
    })
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : '创建失败' })
  }
})

export default router
