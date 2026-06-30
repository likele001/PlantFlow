/**
 * 淘宝客服消息路由
 * - GET/POST /taobao/config — 淘宝渠道配置 CRUD
 * - POST /taobao/poll — TMC 消息轮询端点（前端或 cron 调用）
 * - POST /taobao/webhook/:tenantId — 淘宝消息回调（可选，备用）
 */
import crypto from 'crypto'
import express, { Router, type Request, type Response } from 'express'
import { type TaobaoChannelConfig, getTaobaoConfig, upsertTaobaoConfig } from '../store.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import {
  topCall,
  tmcConsume,
  tmcConfirm,
  tmcUserPermit,
  sendWangwangMsg,
  parseChatMessage,
} from '../plugins/taobao/top-client.js'

const router = Router()

// --------------- Config CRUD ---------------

router.get('/taobao/config', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const cfg = await getTaobaoConfig(tenantId)
  res.status(200).json({ success: true, data: cfg ?? null })
})

router.post('/taobao/config', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const body = (req.body ?? {}) as Partial<TaobaoChannelConfig>
  const next: TaobaoChannelConfig = {
    appKey: String(body.appKey ?? '').trim(),
    appSecret: String(body.appSecret ?? '').trim(),
    session: String(body.session ?? '').trim(),
    sellerNick: String(body.sellerNick ?? '').trim(),
    tmcGroup: String(body.tmcGroup ?? 'default').trim(),
  }
  if (!next.appKey || !next.appSecret || !next.sellerNick) {
    res.status(400).json({ success: false, error: 'Missing taobao config fields (appKey, appSecret, sellerNick)' })
    return
  }
  await upsertTaobaoConfig(tenantId, next)
  // 自动将卖家加入 TMC 分组
  try {
    await tmcUserPermit(next.appKey, next.appSecret, next.sellerNick, next.tmcGroup, next.session || undefined)
  } catch (e) {
    console.error('[taobao] tmcUserPermit failed:', (e as Error).message)
  }
  res.status(200).json({ success: true, data: next })
})

// --------------- OAuth 回调 ---------------

router.get('/taobao/oauth/callback', async (req: Request, res: Response): Promise<void> => {
  const code = String(req.query.code ?? '')
  const state = String(req.query.state ?? '')
  if (!code) {
    res.status(400).json({ success: false, error: 'Missing code' })
    return
  }
  // TODO: 用 code 换取 session，需要知道 appKey/appSecret
  // 暂存 code，前端让用户输入
  res.status(200).json({ success: true, data: { code, state } })
})

// --------------- TMC 消息轮询 ---------------

router.post('/taobao/poll', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const cfg = await getTaobaoConfig(tenantId)
  if (!cfg) {
    res.status(400).json({ success: false, error: 'Taobao not configured' })
    return
  }
  try {
    const result = await tmcConsume(cfg.appKey, cfg.appSecret, cfg.tmcGroup, '64', cfg.session || undefined)
    const messages = result.messages ?? []
    const processed: string[] = []

    for (const msg of messages) {
      // 处理聊天消息 topic
      if (msg.topic === 'taobao_trade_TradeCreated' || msg.topic.includes('Chat') || msg.topic.includes('wangwang')) {
        const chat = parseChatMessage(msg.content)
        if (chat) {
          // 触发工作流
          const { triggerMatchingWorkflows } = await import('../engine/executor.js')
          void triggerMatchingWorkflows(tenantId, 'trigger.taobao', {
            channel: 'taobao',
            topic: msg.topic,
            conversationId: `taobao:${chat.toUser}`,
            fromId: chat.fromUser,
            toUser: chat.toUser,
            content: chat.content,
            raw: msg,
          }).catch((e) => console.error('[taobao] workflow trigger failed', e))
        }
      }
      processed.push(msg.id)
    }

    // 批量确认消息
    for (const id of processed) {
      try {
        await tmcConfirm(cfg.appKey, cfg.appSecret, id, cfg.tmcGroup, cfg.session || undefined)
      } catch {
        // confirm 失败不影响
      }
    }

    res.status(200).json({ success: true, data: { consumed: messages.length, topics: messages.map((m) => m.topic) } })
  } catch (e) {
    console.error('[taobao] poll error:', (e as Error).message)
    res.status(502).json({ success: false, error: (e as Error).message })
  }
})

// --------------- 发送消息 ---------------

router.post('/taobao/send', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const tenantId = req.auth!.tenantId
  const cfg = await getTaobaoConfig(tenantId)
  if (!cfg) {
    res.status(400).json({ success: false, error: 'Taobao not configured' })
    return
  }
  const { toUser, content } = (req.body ?? {}) as { toUser?: string; content?: string }
  const user = String(toUser ?? '').trim()
  const text = String(content ?? '').trim()
  if (!user || !text) {
    res.status(400).json({ success: false, error: 'Missing toUser or content' })
    return
  }
  try {
    await sendWangwangMsg(cfg.appKey, cfg.appSecret, cfg.session, user, text)
    res.status(200).json({ success: true, data: true })
  } catch (e) {
    console.error('[taobao] send error:', (e as Error).message)
    res.status(502).json({ success: false, error: (e as Error).message })
  }
})

export default router
