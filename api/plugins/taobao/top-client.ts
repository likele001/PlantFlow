/**
 * 淘宝开放平台 TOP API 客户端
 * - MD5 签名算法
 * - HTTP API 调用
 * - OAuth2.0 授权码换取 session
 * - TMC 消息轮询消费与确认
 */

import crypto from 'crypto'
import type { Id } from '../../store.js'

// --------------- types ---------------

export interface TaobaoAppConfig {
  appKey: string
  appSecret: string
  /** 商家授权后获得的 session，有效期 24h，需刷新 */
  session?: string
  /** TMC 分组名，默认 default */
  tmcGroup?: string
  /** 回调地址（OAuth 授权码回调） */
  callbackUrl?: string
}

export interface TaobaoChannelConfig {
  appKey: string
  appSecret: string
  session: string
  sellerNick: string
  tmcGroup: string
}

type TopMethod = string

interface TopResponse {
  taobao_response?: Record<string, unknown>
  error_response?: { code: number; msg: string; sub_code?: string; sub_msg?: string }
  [key: string]: unknown
}

// --------------- sign ---------------

export function topSign(params: Record<string, string>, appSecret: string): string {
  // 1. 剔除 sign 和空值，按 key 排序
  const filtered = Object.entries(params)
    .filter(([k, v]) => k !== 'sign' && v !== '' && v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  // 2. 拼接 key+value
  const query = filtered.map(([k, v]) => k + v).join('')
  // 3. MD5(secret + query + secret)
  const str = appSecret + query + appSecret
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase()
}

// --------------- common params ---------------

function commonParams(appKey: string, method: TopMethod, session?: string): Record<string, string> {
  return {
    app_key: appKey,
    method,
    session: session ?? '',
    timestamp: String(Date.now()),
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
    partner_id: 'top-apitools',
  }
}

// --------------- API call ---------------

const TOP_GATEWAY = 'https://eco.taobao.com/router/rest'

export async function topCall<T = unknown>(
  method: TopMethod,
  appKey: string,
  appSecret: string,
  bizParams: Record<string, string> = {},
  session?: string,
): Promise<T> {
  const params = { ...commonParams(appKey, method, session), ...bizParams }
  params.sign = topSign(params, appSecret)

  const body = new URLSearchParams(params).toString()
  const res = await fetch(TOP_GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = (await res.json()) as TopResponse

  if (json.error_response) {
    const e = json.error_response
    throw new Error(`TOP API error ${e.code}: ${e.msg} ${e.sub_msg ?? ''}`)
  }
  return json as T
}

// --------------- TMC 消息 ---------------

export async function tmcConsume(
  appKey: string,
  appSecret: string,
  group = 'default',
  quantity = '128',
  session?: string,
): Promise<{ messages: Array<{ topic: string; content: string; id: string; ouid: string }> }> {
  return topCall(
    'taobao.tmc.messages.consume',
    appKey,
    appSecret,
    { group, quantity },
    session,
  ) as never
}

export async function tmcConfirm(
  appKey: string,
  appSecret: string,
  messageId: string,
  group = 'default',
  session?: string,
): Promise<void> {
  await topCall(
    'taobao.tmc.messages.confirm',
    appKey,
    appSecret,
    { group, messageId: messageId, ouid: '' },
    session,
  )
}

export async function tmcUserPermit(
  appKey: string,
  appSecret: string,
  userId: string,
  group = 'default',
  session?: string,
): Promise<void> {
  await topCall(
    'taobao.tmc.user.permit',
    appKey,
    appSecret,
    { user_id: userId, group, topics: 'taobao_item_AuctionAdded,taobao_trade_TradeCreated' },
    session,
  )
}

// --------------- 旺旺消息发送 ---------------

export async function sendWangwangMsg(
  appKey: string,
  appSecret: string,
  session: string,
  toUser: string,
  content: string,
): Promise<void> {
  await topCall(
    'taobao.wangwang.Eservice.ChatSend',
    appKey,
    appSecret,
    {
      cfrom: '',
      cto: toUser,
      content,
    },
    session,
  )
}

// --------------- session 刷新 ---------------

export async function refreshToken(
  appKey: string,
  appSecret: string,
  refreshToken: string,
): Promise<{ session: string; refresh_token: string }> {
  return topCall(
    'taobao.top.auth.token.refresh',
    appKey,
    appSecret,
    { refresh_token: refreshToken },
  ) as never
}

// --------------- helpers ---------------

/** 解析 TMC 消息内容中的聊天消息 */
export function parseChatMessage(content: string): {
  fromUser: string
  toUser: string
  content: string
  msgId: string
  timestamp: string
} | null {
  try {
    const data = JSON.parse(content) as Record<string, unknown>
    return {
      fromUser: String(data.from_user ?? ''),
      toUser: String(data.to_user ?? ''),
      content: String(data.content ?? ''),
      msgId: String(data.msg_id ?? ''),
      timestamp: String(data.timestamp ?? ''),
    }
  } catch {
    return null
  }
}

export default {
  topSign,
  topCall,
  tmcConsume,
  tmcConfirm,
  tmcUserPermit,
  sendWangwangMsg,
  refreshToken,
  parseChatMessage,
}
