/**
 * AI model provider management.
 *   GET    /api/ai/providers              list (returns masked keys)
 *   POST   /api/ai/providers              create
 *   PATCH  /api/ai/providers/:id          update (apiKey optional)
 *   DELETE /api/ai/providers/:id
 *   POST   /api/ai/providers/:id/default
 *   POST   /api/ai/providers/:id/test     probe connectivity to <base>/models
 */
import { Router, type Response } from 'express'
import { db } from '../store.js'
import { maskSecret } from '../crypto.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

const router = Router()

router.use(requireAuth)

function bad(res: Response, msg: string, code = 400) {
  res.status(code).json({ success: false, error: msg })
}

router.get('/providers', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const list = await db.listProviders(tenantId)
  res.json({ success: true, data: list })
})

router.post('/providers', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const body = (req.body ?? {}) as {
    name?: string
    baseUrl?: string
    apiKey?: string
    defaultChatModel?: string
    defaultEmbeddingModel?: string | null
    isDefault?: boolean
  }
  const name = String(body.name ?? '').trim()
  const baseUrl = String(body.baseUrl ?? '').trim().replace(/\/+$/, '')
  const apiKey = String(body.apiKey ?? '')
  const defaultChatModel = String(body.defaultChatModel ?? '').trim()
  const defaultEmbeddingModel =
    body.defaultEmbeddingModel == null ? null : String(body.defaultEmbeddingModel).trim() || null

  if (!name || !baseUrl || !apiKey || !defaultChatModel) {
    bad(res, 'name / baseUrl / apiKey / defaultChatModel 均为必填')
    return
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    bad(res, 'baseUrl 必须以 http(s):// 开头')
    return
  }

  if (body.isDefault) {
    await db.setDefaultProvider(tenantId, '__none__').catch(() => {
      /* no-op: harmless when no row matches; we just clear the slot */
    })
  }

  const provider = await db.insertProvider({
    tenantId,
    name,
    baseUrl,
    apiKey,
    apiKeyMasked: maskSecret(apiKey),
    defaultChatModel,
    defaultEmbeddingModel,
    isDefault: !!body.isDefault,
  })

  if (body.isDefault) {
    // The insert above set is_default=true; enforce uniqueness by re-running.
    await db.setDefaultProvider(tenantId, provider.id)
    const refreshed = await db.findProvider(tenantId, provider.id)
    res.status(201).json({ success: true, data: refreshed })
    return
  }

  res.status(201).json({ success: true, data: provider })
})

router.patch('/providers/:id', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const id = req.params.id
  const body = (req.body ?? {}) as {
    name?: string
    baseUrl?: string
    apiKey?: string
    defaultChatModel?: string
    defaultEmbeddingModel?: string | null
  }

  const patch: Parameters<typeof db.updateProvider>[0] = { tenantId, id }
  if (body.name !== undefined) patch.name = String(body.name).trim()
  if (body.baseUrl !== undefined) {
    const u = String(body.baseUrl).trim().replace(/\/+$/, '')
    if (!/^https?:\/\//i.test(u)) {
      bad(res, 'baseUrl 必须以 http(s):// 开头')
      return
    }
    patch.baseUrl = u
  }
  if (body.defaultChatModel !== undefined) {
    patch.defaultChatModel = String(body.defaultChatModel).trim()
  }
  if (body.defaultEmbeddingModel !== undefined) {
    patch.defaultEmbeddingModel =
      body.defaultEmbeddingModel == null ? null : String(body.defaultEmbeddingModel).trim() || null
  }
  if (body.apiKey !== undefined && body.apiKey !== '') {
    patch.apiKey = String(body.apiKey)
    patch.apiKeyMasked = maskSecret(String(body.apiKey))
  }

  const updated = await db.updateProvider(patch)
  if (!updated) {
    bad(res, 'Provider not found', 404)
    return
  }
  res.json({ success: true, data: updated })
})

router.delete('/providers/:id', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const ok = await db.deleteProvider(tenantId, req.params.id)
  if (!ok) {
    bad(res, 'Provider not found', 404)
    return
  }
  res.json({ success: true })
})

router.post('/providers/:id/default', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const exists = await db.findProvider(tenantId, req.params.id)
  if (!exists) {
    bad(res, 'Provider not found', 404)
    return
  }
  await db.setDefaultProvider(tenantId, req.params.id)
  const refreshed = await db.findProvider(tenantId, req.params.id)
  res.json({ success: true, data: refreshed })
})

router.post('/providers/:id/test', async (req: AuthedRequest, res: Response) => {
  const tenantId = req.auth!.tenantId
  const secret = await db.getProviderSecret(tenantId, req.params.id)
  if (!secret) {
    bad(res, 'Provider not found', 404)
    return
  }
  const url = `${secret.baseUrl}/models`
  const started = Date.now()
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret.apiKey}` },
    })
    const ms = Date.now() - started
    const text = await r.text()
    let parsed: unknown = null
    try { parsed = JSON.parse(text) } catch { /* not json */ }
    if (!r.ok) {
      res.status(502).json({
        success: false,
        error: `HTTP ${r.status} from upstream`,
        detail: typeof parsed === 'object' ? parsed : text.slice(0, 500),
      })
      return
    }
    // OpenAI returns { data: [...] }. Some clones (e.g. Ollama) return { models: [...] }.
    const arr =
      (parsed && typeof parsed === 'object' && 'data' in (parsed as Record<string, unknown>)
        ? (parsed as { data: unknown[] }).data
        : null) ??
      (parsed && typeof parsed === 'object' && 'models' in (parsed as Record<string, unknown>)
        ? (parsed as { models: unknown[] }).models
        : null) ??
      []
    res.json({
      success: true,
      data: {
        ok: true,
        httpStatus: r.status,
        latencyMs: ms,
        modelCount: Array.isArray(arr) ? arr.length : 0,
      },
    })
  } catch (e) {
    res.status(502).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    })
  }
})

export default router
