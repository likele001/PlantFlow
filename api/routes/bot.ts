/**
 * Bot 对话 API 路由
 * 场景管理 / 配置管理 / 会话查询
 */
import { Router, type Response } from 'express'
import { pool } from '../db.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { BUILTIN_SCENARIOS, type BotScenario } from './bot-engine.js'

export const router = Router()

type BotConfigRow = { id: string; tenantId: string; name: string; greeting: string; activeScenarios: string[]; notifyAdmins: string[]; autoReply: boolean }
type BotSessionRow = { id: string; tenantId: string; channel: 'wecom' | 'feishu'; externalId: string; state: string; scenarioId: string | null; step: number; params: Record<string, string>; createdAt: string; updatedAt: string }

// ── GET /api/bot/scenarios ──────────────────────
router.get('/scenarios', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { tenantId } = req.auth!
  const { rows } = await pool.query(
    `SELECT id, tenant_id AS "tenantId", industry, name, description, icon, steps, workflow_id AS "workflowId", is_builtin AS "isBuiltin", is_active AS "isActive"
     FROM bot_scenarios WHERE tenant_id = $1 AND is_active = true`,
    [tenantId],
  )
  const custom: BotScenario[] = (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    industry: String(r.industry),
    name: String(r.name),
    description: String(r.description ?? ''),
    icon: String(r.icon ?? 'x'),
    keywords: [] as string[],
    steps: (typeof r.steps === 'string' ? JSON.parse(r.steps) : (r.steps ?? [])) as BotScenario['steps'],
    workflowId: r.workflowId ? String(r.workflowId) : null,
    isBuiltin: Boolean(r.isBuiltin),
    isActive: Boolean(r.isActive),
  }))
  const all: BotScenario[] = [...BUILTIN_SCENARIOS, ...custom]
  res.json({ success: true, data: all })
})

// ── GET /api/bot/config ──────────────────────
router.get('/config', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { tenantId } = req.auth!
  const { rows } = await pool.query<BotConfigRow>(
    `SELECT id, tenant_id AS "tenantId", name, greeting, active_scenarios AS "activeScenarios", notify_admins AS "notifyAdmins", auto_reply AS "autoReply"
     FROM bot_configs WHERE tenant_id = $1`,
    [tenantId],
  )
  const existing = rows[0]
  const config = existing ?? {
    name: '智能助手',
    greeting: '您好！有什么可以帮您？',
    activeScenarios: BUILTIN_SCENARIOS.map(s => s.id),
    notifyAdmins: [],
    autoReply: true,
  }
  res.json({ success: true, data: config })
})

// ── POST /api/bot/config ──────────────────────
router.post('/config', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { tenantId } = req.auth!
  const body = req.body as Partial<BotConfigRow>
  await pool.query(
    `INSERT INTO bot_configs (tenant_id, name, greeting, active_scenarios, notify_admins, auto_reply)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id) DO UPDATE SET
       name = EXCLUDED.name, greeting = EXCLUDED.greeting,
       active_scenarios = EXCLUDED.active_scenarios,
       notify_admins = EXCLUDED.notify_admins, auto_reply = EXCLUDED.auto_reply`,
    [
      tenantId,
      body.name ?? '智能助手',
      body.greeting ?? '您好！有什么可以帮您？',
      JSON.stringify(body.activeScenarios ?? []),
      JSON.stringify(body.notifyAdmins ?? []),
      body.autoReply !== false,
    ],
  )
  res.json({ success: true, data: { ...body, tenantId } })
})

// ── GET /api/bot/sessions ──────────────────────
router.get('/sessions', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { tenantId } = req.auth!
  const { rows } = await pool.query<BotSessionRow>(
    `SELECT id, tenant_id AS "tenantId", channel, external_id AS "externalId", state, scenario_id AS "scenarioId", step, params, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM bot_sessions WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 50`,
    [tenantId],
  )
  res.json({ success: true, data: rows })
})

// ── GET /api/bot/sessions/:id/messages ──────────────────────
router.get('/sessions/:sessionId/messages', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { tenantId } = req.auth!
  const { sessionId } = req.params
  const { rows } = await pool.query(
    `SELECT id, tenant_id AS "tenantId", session_id AS "sessionId", direction, sender_name AS "senderName", content, created_at AS "createdAt"
     FROM bot_messages WHERE tenant_id = $1 AND session_id = $2 ORDER BY created_at ASC`,
    [tenantId, sessionId],
  )
  res.json({ success: true, data: rows })
})

export default router
