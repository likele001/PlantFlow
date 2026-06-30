/**
 * This is a user authentication API route demo.
 * Handle user registration, login, token management, etc.
 */
import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import { db } from '../store.js'
import { rateLimitCheck } from '../redis.js'

const router = Router()

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { companyName, email, password } = (req.body ?? {}) as {
    companyName?: string; email?: string; password?: string
  }
  const name = String(companyName ?? '').trim()
  const e = String(email ?? '').trim().toLowerCase()
  const pw = String(password ?? '')

  if (!name || !e || !pw) {
    res.status(400).json({ success: false, error: '公司名 / 邮箱 / 密码 均为必填' })
    return
  }
  if (pw.length < 6) {
    res.status(400).json({ success: false, error: '密码至少 6 位' })
    return
  }

  const existingUser = await db.findUserByEmail(e)
  if (existingUser) {
    res.status(409).json({ success: false, error: '该邮箱已注册' })
    return
  }

  try {
    const tenant = await db.createTenant(name)
    const hashed = await db.hashPassword(pw)
    const user = await db.createUser(e, hashed)
    await db.createMembership({ tenantId: tenant.id, userId: user.id, role: 'tenant_admin' })

    const token = crypto.randomBytes(24).toString('hex')
    await db.createSession(token, user.id, tenant.id)

    res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, role: 'tenant_admin' as const },
        tenant: { id: tenant.id, name: tenant.name },
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: '注册失败，请稍后重试' })
  }
})

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string }
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown')
    const rl = await rateLimitCheck(`login:${ip}`, 20, 300)
    if (!rl.ok) { res.status(429).json({ success: false, error: '登录尝试过于频繁，请稍后再试' }); return }
    if (!email || !password) { res.status(400).json({ success: false, error: 'Missing email or password' }); return }
    const user = await db.findUserByEmailAndPassword(email, password)
    if (!user) { res.status(401).json({ success: false, error: 'Invalid credentials' }); return }
    const membership = await db.findFirstMembershipForUser(user.id)
    if (!membership) { res.status(403).json({ success: false, error: 'No tenant membership' }); return }
    const token = crypto.randomBytes(24).toString('hex')
    await db.createSession(token, user.id, membership.tenantId)
    const tenant = await db.findTenantById(membership.tenantId)
    res.status(200).json({ success: true, data: { token, user: { id: user.id, email: user.email, role: membership.role }, tenant: tenant ? { id: tenant.id, name: tenant.name } : null } })
  } catch(e: any) {
    console.error('[LOGIN ERROR]', e)
    res.status(500).json({ success: false, error: 'LOGIN_ERR: ' + (e?.message ?? String(e)) })
  }
})

router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  const raw = req.headers.authorization
  const token =
    typeof raw === 'string' && raw.startsWith('Bearer ')
      ? raw.slice('Bearer '.length)
      : null
  if (token) {
    await db.deleteSession(token)
  }
  res.status(200).json({ success: true })
})

import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

router.post('/change-password', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = (req.body ?? {}) as { currentPassword?: string; newPassword?: string }
  const cur = String(currentPassword ?? '')
  const next = String(newPassword ?? '')
  if (!cur || !next) {
    res.status(400).json({ success: false, error: '请填写当前密码和新密码' })
    return
  }
  if (next.length < 6) {
    res.status(400).json({ success: false, error: '新密码至少 6 位' })
    return
  }
  if (cur === next) {
    res.status(400).json({ success: false, error: '新密码不能与当前密码相同' })
    return
  }

  const user = await db.findUserById(req.auth!.userId)
  if (!user) {
    res.status(404).json({ success: false, error: '用户不存在' })
    return
  }
  const ok = await db.verifyPassword(cur, user.password)
  if (!ok) {
    res.status(401).json({ success: false, error: '当前密码不正确' })
    return
  }

  const hashed = await db.hashPassword(next)
  await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, user.id])
  await db.deleteAllSessionsForUser(user.id)

  res.json({ success: true, message: '密码已修改，请重新登录' })
})

import { pool } from '../db.js'

router.post('/admin/reset-password', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const role = await db.getMembershipRole(req.auth!.userId, req.auth!.tenantId)
  if (role !== 'tenant_admin' && role !== 'platform_admin') {
    res.status(403).json({ success: false, error: '仅管理员可重置成员密码' })
    return
  }

  const { userId, newPassword } = (req.body ?? {}) as { userId?: string; newPassword?: string }
  const uid = String(userId ?? '')
  const np = String(newPassword ?? '')
  if (!uid || !np) {
    res.status(400).json({ success: false, error: 'userId / newPassword 必填' })
    return
  }
  if (np.length < 6) {
    res.status(400).json({ success: false, error: '新密码至少 6 位' })
    return
  }

  const memberCheck = await pool.query<{ tenant_id: string }>(
    `SELECT tenant_id FROM memberships WHERE user_id = $1`,
    [uid]
  )
  const memberTenantId = memberCheck.rows[0]?.tenant_id
  if (!memberTenantId || memberTenantId !== req.auth!.tenantId) {
    res.status(404).json({ success: false, error: '成员不存在于本租户' })
    return
  }

  const hashed = await db.hashPassword(np)
  await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, uid])
  await db.deleteAllSessionsForUser(uid)

  res.json({ success: true, message: '密码已重置' })
})

export default router
