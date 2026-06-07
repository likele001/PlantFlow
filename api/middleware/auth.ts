import type { NextFunction, Request, Response } from 'express'
import { db, type Id } from '../store.js'

export type AuthedRequest = Request & {
  auth?: {
    userId: Id
    tenantId: Id
  }
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const raw = req.headers.authorization
  const token =
    typeof raw === 'string' && raw.startsWith('Bearer ')
      ? raw.slice('Bearer '.length)
      : null

  if (!token) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  const session = await db.getSession(token)
  if (!session) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  req.auth = { userId: session.userId, tenantId: session.tenantId }
  next()
}
