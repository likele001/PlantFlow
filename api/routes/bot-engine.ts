/**
 * Bot 对话引擎核心（无 channels 依赖，供 channels.ts 导入）
 * 意图识别 → 追问参数 → 执行场景
 */
import { pool } from '../db.js'
import { getFeishuTenantToken, getWecomAccessToken } from './channels.js'
import type { WecomChannelConfig, FeishuChannelConfig, Id } from '../store.js'
import { nodeRegistry } from '../engine/nodes/index.js'
import { runWorkflow } from '../engine/executor.js'

export type BotStep = {
  id: string
  type: 'choice' | 'text' | 'confirm'
  question: string
  key: string
  options?: string[]
}

export type BotScenario = {
  id: string
  industry: string
  name: string
  description: string
  icon: string
  keywords: string[]
  steps: BotStep[]
  workflowId: string | null
  isBuiltin: boolean
}

export type BotSessionRow = {
  id: string
  tenantId: string
  channel: 'wecom' | 'feishu'
  externalId: string
  state: 'idle' | 'collecting' | 'completed'
  scenarioId: string | null
  step: number
  params: Record<string, string>
  createdAt: string
  updatedAt: string
}

// ─────────────────────────────────────────────
// 预置场景模板
// ─────────────────────────────────────────────
export const BUILTIN_SCENARIOS: BotScenario[] = [
  {
    id: 'builtin-restaurant-order',
    industry: 'restaurant',
    name: '新订单通知',
    description: '顾客下单后，自动推送订单信息给后厨和配送员',
    icon: '🍽️',
    keywords: ['新订单', '有订单', '来单了', '订单'],
    steps: [],
    workflowId: null,
    isBuiltin: true,
  },
  {
    id: 'builtin-restaurant-reserve',
    industry: 'restaurant',
    name: '预约确认',
    description: '顾客发起预约，系统自动确认时间并记录',
    icon: '📅',
    keywords: ['预约', '订座', '预订'],
    steps: [
      { id: 's1', type: 'text', question: '请问您的姓名？', key: 'name' },
      { id: 's2', type: 'text', question: '请问几位用餐？', key: 'guests' },
      { id: 's3', type: 'text', question: '预约几点？', key: 'time' },
      { id: 's4', type: 'text', question: '联系电话？', key: 'phone' },
    ],
    workflowId: null,
    isBuiltin: true,
  },
  {
    id: 'builtin-restaurant-reviews',
    industry: 'restaurant',
    name: '差评预警',
    description: '检测到差评关键词，自动通知负责人处理',
    icon: '⚠️',
    keywords: ['差评', '投诉', '不满', '退款'],
    steps: [],
    workflowId: null,
    isBuiltin: true,
  },
  {
    id: 'builtin-retail-stock',
    industry: 'retail',
    name: '库存预警',
    description: '库存低于阈值时自动通知采购人员补货',
    icon: '📦',
    keywords: ['库存', '补货', '没货', '缺货'],
    steps: [
      { id: 's1', type: 'text', question: '请输入商品名称：', key: 'product' },
      { id: 's2', type: 'text', question: '当前库存数量：', key: 'qty' },
    ],
    workflowId: null,
    isBuiltin: true,
  },
  {
    id: 'builtin-retail-refund',
    industry: 'retail',
    name: '退款处理',
    description: '客户发起退款，自动通知客服并记录工单',
    icon: '💰',
    keywords: ['退款', '退货', '钱', '售后'],
    steps: [
      { id: 's1', type: 'text', question: '请输入订单号：', key: 'orderId' },
      { id: 's2', type: 'text', question: '退款原因：', key: 'reason' },
    ],
    workflowId: null,
    isBuiltin: true,
  },
  {
    id: 'builtin-beauty-booking',
    industry: 'beauty',
    name: '预约美容师',
    description: '顾客在线预约美容师，系统自动确认档期',
    icon: '💆',
    keywords: ['预约', '美容', '护理', 'SPA'],
    steps: [
      { id: 's1', type: 'text', question: '请输入您的姓名：', key: 'name' },
      { id: 's2', type: 'text', question: '预约哪天？', key: 'date' },
      { id: 's3', type: 'text', question: '预约时间段？', key: 'time' },
      { id: 's4', type: 'text', question: '选择服务项目：', key: 'service' },
    ],
    workflowId: null,
    isBuiltin: true,
  },
  {
    id: 'builtin-repair-report',
    industry: 'repair',
    name: '报修登记',
    description: '客户提交报修单，自动派单给维修师傅',
    icon: '🔧',
    keywords: ['报修', '坏了', '维修', '修理'],
    steps: [
      { id: 's1', type: 'text', question: '请输入您的地址：', key: 'address' },
      { id: 's2', type: 'text', question: '设备类型（如空调/洗衣机）：', key: 'device' },
      { id: 's3', type: 'text', question: '故障描述：', key: 'desc' },
      { id: 's4', type: 'text', question: '您的联系方式：', key: 'contact' },
    ],
    workflowId: null,
    isBuiltin: true,
  },
  {
    id: 'builtin-general-notify',
    industry: 'general',
    name: '全员通知',
    description: '向所有成员群发通知公告',
    icon: '📢',
    keywords: ['通知', '公告', '提醒', '群发'],
    steps: [
      { id: 's1', type: 'text', question: '通知标题：', key: 'title' },
      { id: 's2', type: 'text', question: '通知内容：', key: 'content' },
    ],
    workflowId: null,
    isBuiltin: true,
  },
]

// ─────────────────────────────────────────────
// 数据库读写
// ─────────────────────────────────────────────
async function getBotConfig(tenantId: Id) {
  const { rows } = await pool.query(
    `SELECT id, tenant_id AS "tenantId", name, greeting, active_scenarios AS "activeScenarios", notify_admins AS "notifyAdmins", auto_reply AS "autoReply"
     FROM bot_configs WHERE tenant_id = $1`,
    [tenantId],
  )
  return rows[0] as { id: string; tenantId: string; name: string; greeting: string; activeScenarios: string[]; notifyAdmins: string[]; autoReply: boolean } | null
}

async function getBotSession(tenantId: Id, channel: string, externalId: string): Promise<BotSessionRow | null> {
  const { rows } = await pool.query(
    `SELECT id, tenant_id AS "tenantId", channel, external_id AS "externalId", state, scenario_id AS "scenarioId", step, params, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM bot_sessions WHERE tenant_id = $1 AND channel = $2 AND external_id = $3
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId, channel, externalId],
  )
  return rows[0] as BotSessionRow | null
}

async function createBotSession(tenantId: Id, channel: string, externalId: string): Promise<BotSessionRow> {
  const { rows } = await pool.query<BotSessionRow>(
    `INSERT INTO bot_sessions (tenant_id, channel, external_id, state)
     VALUES ($1, $2, $3, 'idle')
     RETURNING id, tenant_id AS "tenantId", channel, external_id AS "externalId", state, scenario_id AS "scenarioId", step, params, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [tenantId, channel, externalId],
  )
  return rows[0]
}

async function updateBotSession(id: string, patch: Partial<Pick<BotSessionRow, 'state' | 'scenarioId' | 'step' | 'params'>>) {
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (patch.state !== undefined) { sets.push(`state = $${i++}`); vals.push(patch.state) }
  if (patch.scenarioId !== undefined) { sets.push(`scenario_id = $${i++}`); vals.push(patch.scenarioId) }
  if (patch.step !== undefined) { sets.push(`step = $${i++}`); vals.push(patch.step) }
  if (patch.params !== undefined) { sets.push(`params = $${i++}`); vals.push(JSON.stringify(patch.params)) }
  if (sets.length === 0) return
  vals.push(id)
  await pool.query(`UPDATE bot_sessions SET ${sets.join(', ')} WHERE id = $${i}`, vals)
}

async function getTenantBotScenarios(tenantId: Id) {
  const { rows } = await pool.query(
    `SELECT id, tenant_id AS "tenantId", industry, name, description, icon, steps, workflow_id AS "workflowId", is_builtin AS "isBuiltin", is_active AS "isActive"
     FROM bot_scenarios WHERE tenant_id = $1 AND is_active = true`,
    [tenantId],
  )
  return rows.map((r) => ({ ...r, keywords: [], steps: typeof r.steps === 'string' ? JSON.parse(r.steps) : (r.steps ?? []) }))
}

async function insertBotMessage(tenantId: Id, sessionId: string, direction: string, senderName: string, content: string) {
  await pool.query(
    `INSERT INTO bot_messages (tenant_id, session_id, direction, sender_name, content)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, sessionId, direction, senderName, content],
  )
}

// ─────────────────────────────────────────────
// 意图识别
// ─────────────────────────────────────────────
function matchIntent(text: string, scenarios: BotScenario[]): BotScenario | null {
  const t = text.trim().toLowerCase()
  for (const s of scenarios) {
    if (s.keywords.some((kw) => t.includes(kw.toLowerCase()))) return s
  }
  return null
}

// ─────────────────────────────────────────────
// 发送消息到渠道
// ─────────────────────────────────────────────
async function sendToChannel(
  tenantId: Id,
  channel: 'wecom' | 'feishu',
  to: string,
  msg: string,
): Promise<void> {
  if (channel === 'wecom') {
    const { rows } = await pool.query<{ wecom: WecomChannelConfig | null }>(
      `SELECT wecom FROM channel_configs WHERE tenant_id = $1`, [tenantId],
    )
    const cfg = rows[0]?.wecom as WecomChannelConfig | null
    if (!cfg) return
    const token = await getWecomAccessToken(tenantId, cfg)
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ touser: to, msgtype: 'text', agentid: cfg.agentId, text: { content: msg } }),
    })
  } else {
    const { rows } = await pool.query<{ feishu: FeishuChannelConfig | null }>(
      `SELECT feishu FROM channel_configs WHERE tenant_id = $1`, [tenantId],
    )
    const cfg = rows[0]?.feishu as FeishuChannelConfig | null
    if (!cfg) return
    const token = await getFeishuTenantToken(tenantId, cfg)
    const url = `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ receive_id: to, msg_type: 'text', content: JSON.stringify({ text: msg }) }),
    })
  }
}

// ─────────────────────────────────────────────
// 执行场景
// ─────────────────────────────────────────────
async function executeScenario(
  tenantId: Id,
  channel: 'wecom' | 'feishu',
  externalId: string,
  scenario: BotScenario,
  params: Record<string, string>,
  sessionId: string,
): Promise<void> {
  if (scenario.workflowId) {
    try {
      await runWorkflow({
        tenantId,
        workflowId: scenario.workflowId,
        triggerType: 'trigger.bot',
        triggerData: { channel, fromId: externalId, scenario: scenario.id, params },
      })
    } catch (e) {
      console.error('[bot] workflow error', e)
    }
  }
  await insertBotMessage(tenantId, sessionId, 'out', 'bot', `✅ 执行：${scenario.name}`)
}

// ─────────────────────────────────────────────
// 处理单条用户消息（被 channels.ts 调用）
// ─────────────────────────────────────────────
export async function handleBotMessage(
  tenantId: string,
  channel: 'wecom' | 'feishu',
  externalId: string,
  text: string,
): Promise<void> {
  const normalizedText = text.trim()
  if (!normalizedText) return

  // 1. 获取/创建会话
  let session = await getBotSession(tenantId, channel, externalId)
  if (!session) session = await createBotSession(tenantId, channel, externalId)

  const config = await getBotConfig(tenantId)
  if (!config?.autoReply) return  // 未开启自动回复则跳过

  const activeIds = config.activeScenarios ?? []
  const allScenarios: BotScenario[] = [
    ...BUILTIN_SCENARIOS.filter((s) => activeIds.includes(s.id) || activeIds.length === 0),
    ...(await getTenantBotScenarios(tenantId) as BotScenario[]),
  ]

  async function send(to: string, msg: string) {
    await sendToChannel(tenantId as Id, channel, to, msg)
  }

  // 2. 状态机：收集参数中
  if (session.state === 'collecting' && session.scenarioId) {
    const scenario = allScenarios.find((s) => s.id === session.scenarioId)
    if (scenario) {
      const currentStep = scenario.steps[session.step] as BotStep | undefined
      const nextParams = { ...(session.params as Record<string, string>), [currentStep?.key ?? '']: normalizedText }
      if (session.step < scenario.steps.length - 1) {
        const nextStep = scenario.steps[session.step + 1] as BotStep
        await updateBotSession(session.id, { step: session.step + 1, params: nextParams })
        await send(externalId, nextStep.question)
      } else {
        await updateBotSession(session.id, { state: 'completed', params: nextParams })
        await executeScenario(tenantId as Id, channel, externalId, scenario, nextParams, session.id)
        await send(externalId, `✅ ${scenario.name}已完成！`)
      }
      return
    }
  }

  // 3. 空闲状态：意图识别
  const matched = matchIntent(normalizedText, allScenarios)
  if (matched) {
    await updateBotSession(session.id, { state: 'collecting', scenarioId: matched.id, step: 0, params: {} })
    if (matched.steps.length === 0) {
      await updateBotSession(session.id, { state: 'completed' })
      await executeScenario(tenantId as Id, channel, externalId, matched, {}, session.id)
      await send(externalId, `✅ ${matched.name}已开启！`)
    } else {
      await send(externalId, (matched.steps[0] as BotStep)?.question ?? '请继续')
    }
    return
  }

  // 4. 无法识别：显示场景列表
  const greeting = config.greeting ?? '您好！请选择您需要的业务：'
  const lines = [greeting, '']
  for (const s of allScenarios.slice(0, 9)) {
    lines.push(`${s.icon} ${s.name}`)
  }
  lines.push('', '发送关键词即可，如：新订单、库存、报修')
  await send(externalId, lines.join('\n'))
}
