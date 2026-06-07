import { Router, type Request, type Response } from 'express'
import { db } from '../store.js'
import { runChatAppMessage } from '../engine/chat-app.js'
import { chatCompletionStream } from '../engine/llm.js'

const router = Router()

/**
 * OpenAI-compatible chat endpoint for published apps.
 * POST /api/v1/chat/completions
 * Authorization: Bearer app_xxx
 */
router.post('/completions', async (req: Request, res: Response): Promise<void> => {
  const auth = req.headers.authorization
  const apiKey =
    typeof auth === 'string' && auth.startsWith('Bearer ')
      ? auth.slice(7)
      : String(req.headers['x-api-key'] ?? '')

  if (!apiKey) {
    res.status(401).json({ error: { message: 'Missing API key' } })
    return
  }

  const app = await db.findChatAppByApiKey(apiKey)
  if (!app) {
    res.status(401).json({ error: { message: 'Invalid API key' } })
    return
  }

  const body = (req.body ?? {}) as {
    messages?: { role: string; content: string }[]
    user?: string
  }

  const messages = body.messages ?? []
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const content = String(lastUser?.content ?? '').trim()
  if (!content) {
    res.status(400).json({ error: { message: 'messages 中需要 user 消息' } })
    return
  }

  try {
    const { reply, executionId } = await runChatAppMessage({
      tenantId: app.tenantId,
      appId: app.id,
      workflowId: app.workflowId,
      message: content,
      userId: body.user,
      sessionId: body.user,
    })

    res.json({
      id: executionId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: app.name,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: reply },
          finish_reason: 'stop',
        },
      ],
    })
  } catch (e) {
    res.status(500).json({
      error: { message: e instanceof Error ? e.message : String(e) },
    })
  }
})

/** Simple JSON chat endpoint */
router.post('/message', async (req: Request, res: Response): Promise<void> => {
  const apiKey = String(req.headers['x-api-key'] ?? req.body?.api_key ?? '')
  if (!apiKey) {
    res.status(401).json({ success: false, error: 'Missing API key' })
    return
  }
  const app = await db.findChatAppByApiKey(apiKey)
  if (!app) {
    res.status(401).json({ success: false, error: 'Invalid API key' })
    return
  }
  const { message, user } = (req.body ?? {}) as { message?: string; user?: string }
  const content = String(message ?? '').trim()
  if (!content) {
    res.status(400).json({ success: false, error: 'message 必填' })
    return
  }
  try {
    const result = await runChatAppMessage({
      tenantId: app.tenantId,
      appId: app.id,
      workflowId: app.workflowId,
      message: content,
      userId: user,
    })
    res.json({ success: true, data: result })
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    })
  }
})

router.post('/completions/stream', async (req: Request, res: Response): Promise<void> => {
  const apiKey = String(req.headers['x-api-key'] ?? req.body?.api_key ?? '')
  if (!apiKey) {
    res.status(401).json({ success: false, error: 'Missing API key' })
    return
  }
  const app = await db.findChatAppByApiKey(apiKey)
  if (!app) {
    res.status(401).json({ success: false, error: 'Invalid API key' })
    return
  }
  const { message, user } = (req.body ?? {}) as { message?: string; user?: string }
  const content = String(message ?? '').trim()
  if (!content) {
    res.status(400).json({ success: false, error: 'message 必填' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    const wf = await db.findWorkflowWithDefinition(app.tenantId, app.workflowId)
    const hasAi = wf?.definition?.nodes?.some((n) => n.type.startsWith('ai.'))
    if (hasAi) {
      let full = ''
      await chatCompletionStream(
        app.tenantId,
        [{ role: 'user', content }],
        (delta) => {
          full += delta
          res.write(`data: ${JSON.stringify({ delta })}\n\n`)
        },
      )
      const session = await db.getOrCreateChatSession({
        tenantId: app.tenantId,
        appId: app.id,
        externalUser: user,
      })
      await db.insertChatMessage({ sessionId: session.id, role: 'user', content })
      await db.insertChatMessage({ sessionId: session.id, role: 'assistant', content: full })
      res.write(`data: ${JSON.stringify({ done: true, reply: full })}\n\n`)
    } else {
      const result = await runChatAppMessage({
        tenantId: app.tenantId,
        appId: app.id,
        workflowId: app.workflowId,
        message: content,
        userId: user,
      })
      res.write(`data: ${JSON.stringify({ delta: result.reply })}\n\n`)
      res.write(`data: ${JSON.stringify({ done: true, reply: result.reply })}\n\n`)
    }
    res.end()
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e instanceof Error ? e.message : String(e) })}\n\n`)
    res.end()
  }
})

export default router
