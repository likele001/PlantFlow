import { db } from '../../store.js'
import { renderTemplate } from '../template.js'
import type { NodeExecutor, NodeExecuteContext } from './registry.js'

async function getWecomToken(tenantId: string, cfg: { corpId: string; secret: string }) {
  const cached = db.wecomAccessTokenCache.get(tenantId)
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(cfg.corpId)}&corpsecret=${encodeURIComponent(cfg.secret)}`
  const res = await fetch(url)
  const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; errmsg?: string } | null
  if (!data?.access_token) throw new Error(data?.errmsg ?? '获取企业微信 token 失败')
  const ttl = typeof data.expires_in === 'number' ? data.expires_in : 7200
  db.wecomAccessTokenCache.set(tenantId, { token: data.access_token, expiresAt: Date.now() + ttl * 1000 })
  return data.access_token
}

async function getFeishuToken(tenantId: string, cfg: { appId: string; appSecret: string }) {
  const cached = db.feishuTenantTokenCache.get(tenantId)
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
  })
  const data = (await res.json().catch(() => null)) as { tenant_access_token?: string; expire?: number; msg?: string } | null
  if (!data?.tenant_access_token) throw new Error(data?.msg ?? '获取飞书 token 失败')
  const ttl = typeof data.expire === 'number' ? data.expire : 7200
  db.feishuTenantTokenCache.set(tenantId, { token: data.tenant_access_token, expiresAt: Date.now() + ttl * 1000 })
  return data.tenant_access_token
}

export const httpRequest: NodeExecutor = {
  type: 'http.request',
  async execute({ tenantId, node, ctx }) {
    const cfg = node.config ?? {}
    let url = renderTemplate(String(cfg.url ?? ''), ctx)
    const method = String(cfg.method ?? 'GET').toUpperCase()
    const headers: Record<string, string> = {}
    const connectorId = String(cfg.connectorId ?? '')
    if (connectorId) {
      const conn = await db.findConnector(tenantId, connectorId)
      if (!conn) throw new Error('连接器不存在')
      const c = conn.config as { baseUrl?: string; headers?: Record<string, string> }
      if (c.baseUrl && !url.startsWith('http')) url = `${c.baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`
      else if (c.baseUrl && !cfg.url) url = c.baseUrl
      if (c.headers) {
        for (const [k, v] of Object.entries(c.headers)) headers[k] = renderTemplate(String(v), ctx)
      }
    }
    if (!url) throw new Error('HTTP 节点缺少 URL')
    if (cfg.headers && typeof cfg.headers === 'object') {
      for (const [k, v] of Object.entries(cfg.headers as Record<string, string>)) {
        headers[k] = renderTemplate(String(v), ctx)
      }
    }
    let body: string | undefined
    if (cfg.body && method !== 'GET') body = renderTemplate(String(cfg.body), ctx)
    const r = await fetch(url, { method, headers, body })
    const text = await r.text()
    let json: unknown = null
    try { json = JSON.parse(text) } catch { /* text */ }
    return { status: r.status, body: json ?? text }
  },
}

export const channelSend: NodeExecutor = {
  type: 'channel.send',
  async execute({ tenantId, node, ctx }) {
    const cfg = node.config ?? {}
    const channel = String(cfg.channel ?? ctx.trigger.channel ?? 'wecom')
    const content = renderTemplate(String(cfg.content ?? ''), ctx)
    if (!content) throw new Error('消息推送节点缺少内容')

    if (channel === 'wecom') {
      const chCfg = (await db.getChannelConfig(tenantId))?.wecom
      if (!chCfg) throw new Error('企业微信未配置')
      const toUser: string = renderTemplate(String(cfg.toUser ?? (ctx.trigger.fromId as string) ?? ''), ctx)
      const accessToken = await getWecomToken(tenantId, chCfg)
      const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: toUser || undefined,
          msgtype: 'text',
          agentid: chCfg.agentId,
          text: { content },
          safe: 0,
        }),
      })
      const data = (await r.json().catch(() => null)) as { errcode?: number; errmsg?: string } | null
      if (data?.errcode !== 0) throw new Error(data?.errmsg ?? '企业微信发送失败')
      return { sent: true, channel: 'wecom' }
    }

    if (channel === 'feishu') {
      const chCfg = (await db.getChannelConfig(tenantId))?.feishu
      if (!chCfg) throw new Error('飞书未配置')
      const receiveId = renderTemplate(String(cfg.receiveId ?? ctx.trigger.chatId ?? ''), ctx)
      const token = await getFeishuToken(tenantId, chCfg)
      const r = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          receive_id: receiveId,
          msg_type: 'text',
          content: JSON.stringify({ text: content }),
        }),
      })
      const data = (await r.json().catch(() => null)) as { code?: number; msg?: string } | null
      if ((data?.code ?? 0) !== 0) throw new Error(data?.msg ?? '飞书发送失败')
      return { sent: true, channel: 'feishu' }
    }
    throw new Error(`不支持的渠道: ${channel}`)
  },
  async onAfter(ctx: NodeExecuteContext) {
    const n = ctx.node
    if (!ctx.ctx.trigger.conversationId) return
    const content = renderTemplate(String(n.config?.content ?? ''), ctx.ctx)
    await db.insertMessage(
      ctx.tenantId,
      String(ctx.ctx.trigger.conversationId),
      'out',
      'workflow',
      content,
      { executionId: ctx.executionId, nodeId: n.id },
      '工作流',
    )
  },
}
