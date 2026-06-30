import { Router, type Request, type Response } from 'express'
import { db, type Credential } from '../store.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

function ok(res: Response, data: unknown) {
  res.json({ success: true, data })
}
function bad(res: Response, error: string, code = 400) {
  res.status(code).json({ success: false, error })
}

export default function credentialRoutes(): Router {
  const r = Router()

  r.get('/', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const list = await db.listCredentials(req.auth!.tenantId)
      const safe = list.map((c) => ({ ...c, data: undefined }))
      ok(res, safe)
    } catch (e) {
      bad(res, e instanceof Error ? e.message : 'Unknown error')
    }
  })

  r.get('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const cred = await db.getDecryptedCredential(req.auth!.tenantId, req.params.id)
      if (!cred) return bad(res, '凭证不存在', 404)
      ok(res, cred)
    } catch (e) {
      bad(res, e instanceof Error ? e.message : 'Unknown error')
    }
  })

  r.post('/', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { name, type, data } = (req.body ?? {}) as {
        name?: string; type?: string; data?: Record<string, string>
      }
      if (!name || !type) return bad(res, 'name / type 为必填')
      const validTypes = ['api_key', 'oauth2', 'basic_auth', 'bearer_token', 'custom']
      if (!validTypes.includes(type)) return bad(res, `无效类型，支持: ${validTypes.join(', ')}`)
      if (!data || typeof data !== 'object') return bad(res, 'data 为必填对象')

      const cred = await db.createCredential(req.auth!.tenantId, { name, type: type as Credential['type'], data } as { name: string; type: 'api_key' | 'oauth2' | 'basic_auth' | 'bearer_token' | 'custom'; data: Record<string, unknown> })
      ok(res, { id: cred.id, name: cred.name, type: cred.type, maskedPreview: cred.maskedPreview, createdAt: cred.createdAt })
    } catch (e) {
      bad(res, e instanceof Error ? e.message : 'Unknown error')
    }
  })

  r.patch('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { name, data } = (req.body ?? {}) as { name?: string; data?: Record<string, string> }
      const cred = await db.updateCredential(req.auth!.tenantId, req.params.id, { name, data })
      if (!cred) return bad(res, '凭证不存在', 404)
      ok(res, { id: cred.id, name: cred.name, type: cred.type, maskedPreview: cred.maskedPreview, updatedAt: cred.updatedAt })
    } catch (e) {
      bad(res, e instanceof Error ? e.message : 'Unknown error')
    }
  })

  r.delete('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      await db.deleteCredential(req.auth!.tenantId, req.params.id)
      ok(res, { deleted: true })
    } catch (e) {
      bad(res, e instanceof Error ? e.message : 'Unknown error')
    }
  })

  r.post('/oauth/authorize', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const { credentialId, redirectUri } = (req.body ?? {}) as { credentialId?: string; redirectUri?: string }
      if (!credentialId) return bad(res, 'credentialId 为必填')
      const cred = await db.getDecryptedCredential(req.auth!.tenantId, credentialId)
      if (!cred || cred.type !== 'oauth2') return bad(res, '凭证不存在或非 OAuth2 类型', 404)
      const d = cred.data as Record<string, unknown>
      const authUrl = String(d.authUrl ?? '')
      const clientId = String(d.clientId ?? '')
      const scope = d.scope ? String(d.scope) : ''
      if (!authUrl || !clientId) return bad(res, 'OAuth2 凭证需填写 authUrl / clientId')
      const state = crypto.randomUUID()
      await db.createOAuthState({ credentialId, state, redirectUri: redirectUri ?? '', ttlSeconds: 600 })
      const redir = redirectUri ?? ''
      const url = `${authUrl}?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redir)}&state=${state}${scope ? `&scope=${encodeURIComponent(scope)}` : ''}`
      ok(res, { url, state })
    } catch (e) {
      bad(res, e instanceof Error ? e.message : 'Unknown error')
    }
  })

  r.post('/oauth/callback', async (req: Request, res: Response) => {
    try {
      const { state, code } = (req.body ?? {}) as { state?: string; code?: string }
      if (!state || !code) return bad(res, 'state / code 为必填')
      const oauthState = await db.findOAuthStateByState(state)
      if (!oauthState) return bad(res, 'OAuth state 无效或已过期', 400)

      const { pool } = await import('../db.js')
      const { rows } = await pool.query<{ id: string; tenant_id: string; type: string; data: Record<string, unknown> }>(
        `SELECT id, tenant_id, type, data FROM credentials WHERE id = $1`, [oauthState.credentialId],
      )
      if (!rows[0]) return bad(res, '凭证已删除', 404)
      const tenantId = rows[0].tenant_id

      const { decryptCredentialData } = await import('../credential.js')
      const credData = decryptCredentialData(rows[0].type, rows[0].data) as Record<string, unknown>
      const tokenUrl = String(credData.tokenUrl ?? '')
      const clientId = String(credData.clientId ?? '')
      const clientSecret = String(credData.clientSecret ?? '')
      const redirectUri = oauthState.redirectUri || (oauthState.extra as Record<string, unknown>).redirectUri || ''
      if (!tokenUrl) return bad(res, 'OAuth2 凭证未配置 tokenUrl')

      const params = new URLSearchParams()
      params.set('grant_type', 'authorization_code')
      params.set('code', code)
      params.set('client_id', clientId)
      params.set('client_secret', clientSecret)
      params.set('redirect_uri', String(redirectUri))

      const fetchRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: params.toString(),
      })
      const tokenData = (await fetchRes.json().catch(() => null)) as Record<string, unknown> | null
      if (!fetchRes.ok || !tokenData) return bad(res, `Token 交换失败: ${fetchRes.status}`, 502)

      await db.updateCredential(tenantId, oauthState.credentialId, {
        data: {
          accessToken: String(tokenData.access_token ?? ''),
          refreshToken: String(tokenData.refresh_token ?? ''),
          expiresAt: tokenData.expires_in ? String(Date.now() + Number(tokenData.expires_in) * 1000) : '',
        },
      })
      await db.deleteOAuthState(state)
      ok(res, { success: true, credentialId: oauthState.credentialId })
    } catch (e) {
      bad(res, e instanceof Error ? e.message : 'Unknown error')
    }
  })

  return r
}
