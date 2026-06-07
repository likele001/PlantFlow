/**
 * This is a user authentication API route demo.
 * Handle user registration, login, token management, etc.
 */
import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import { db } from '../store.js'
import { rateLimitCheck } from '../redis.js'

const router = Router()

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string }

  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown')
  const rl = await rateLimitCheck(`login:${ip}`, 20, 300)
  if (!rl.ok) {
    res.status(429).json({ success: false, error: '登录尝试过于频繁，请稍后再试' })
    return
  }

  if (!email || !password) {
    res.status(400).json({ success: false, error: 'Missing email or password' })
    return
  }

  const user = await db.findUserByEmailAndPassword(email, password)
  if (!user) {
    res.status(401).json({ success: false, error: 'Invalid credentials' })
    return
  }

  const membership = await db.findFirstMembershipForUser(user.id)
  if (!membership) {
    res.status(403).json({ success: false, error: 'No tenant membership' })
    return
  }

  const token = crypto.randomBytes(24).toString('hex')
  await db.createSession(token, user.id, membership.tenantId)

  const tenant = await db.findTenantById(membership.tenantId)

  res.status(200).json({
    success: true,
    data: {
      token,
      user: { id: user.id, email: user.email, role: membership.role },
      tenant: tenant ? { id: tenant.id, name: tenant.name } : null,
    },
  })
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

export default router
