import { db } from '../store.js'
import { renderTemplate } from './template.js'
import { evaluateCondition } from './evaluate.js'
import { chatCompletion, createEmbedding } from './llm.js'
import {
  findStartNodes,
  nextNodeIds,
  branchTargets,
  parseLoopItems,
  findMergeNodeId,
} from './graph.js'
import type { WorkflowDefinition, WorkflowNode, RunContext } from './types.js'

async function runSubgraph(input: {
  tenantId: string
  executionId: string
  def: WorkflowDefinition
  startIds: string[]
  ctx: RunContext
  stopBeforeNodeIds?: Set<string>
}): Promise<{ failed: boolean; error: string }> {
  const queue = [...input.startIds]
  const visited = new Set<string>()
  let failed = false
  let lastError = ''
  const stop = input.stopBeforeNodeIds ?? new Set<string>()

  while (queue.length && !failed) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId) || stop.has(nodeId)) continue
    visited.add(nodeId)

    const node = input.def.nodes.find((n) => n.id === nodeId)
    if (!node || node.type.startsWith('trigger.') || node.type === 'logic.loop') continue
    if (node.type === 'logic.merge' || node.type === 'logic.parallel') continue

    const step = await db.createExecutionStep({
      executionId: input.executionId,
      nodeId: node.id,
      nodeType: node.type,
      nodeLabel: `${node.label} (循环体)`,
      input: { vars: { ...input.ctx.vars } },
    })

    try {
      const output = await executeNode(input.tenantId, node, input.ctx)
      input.ctx.steps[node.id] = output
      await db.finishExecutionStep(step.id, 'success', output, null)
      for (const nextId of nextNodeIds(node, output, input.def.edges)) {
        if (!visited.has(nextId)) queue.push(nextId)
      }
    } catch (e) {
      failed = true
      lastError = e instanceof Error ? e.message : String(e)
      await db.finishExecutionStep(step.id, 'failed', null, lastError)
    }
  }
  return { failed, error: lastError }
}

async function searchKnowledge(
  tenantId: string,
  kbaseId: string,
  query: string,
  limit = 5,
) {
  const vectorHits = await db.searchKnowledgeChunksVector(tenantId, kbaseId, query, limit).catch(() => [])
  if (vectorHits.length) return { chunks: vectorHits, mode: 'vector' as const }
  const chunks = await db.searchKnowledgeChunks(tenantId, kbaseId, query, limit)
  return { chunks, mode: 'keyword' as const }
}

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

async function executeAgent(
  tenantId: string,
  node: WorkflowNode,
  ctx: RunContext,
): Promise<{ text: string; steps: unknown[] }> {
  const cfg = node.config ?? {}
  const kbaseId = String(cfg.kbaseId ?? '')
  const maxSteps = Math.min(Number(cfg.maxSteps ?? 4), 8)
  const systemPrompt = renderTemplate(String(cfg.systemPrompt ?? ''), ctx)
  const userPrompt = renderTemplate(String(cfg.userPrompt ?? '{{trigger.content}}'), ctx)

  const tools: unknown[] = []
  if (kbaseId) {
    tools.push({
      type: 'function',
      function: {
        name: 'search_knowledge',
        description: '检索知识库获取相关文档片段',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: '检索关键词' } },
          required: ['query'],
        },
      },
    })
  }
  if (cfg.enableHttp !== false) {
    tools.push({
      type: 'function',
      function: {
        name: 'http_request',
        description: '发起 HTTP GET/POST 请求',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
            body: { type: 'string' },
          },
          required: ['url'],
        },
      },
    })
  }

  const messages: { role: string; content: string; tool_calls?: unknown }[] = [
    { role: 'system', content: systemPrompt || '你是简洁高效的中文助手。' },
    { role: 'user', content: userPrompt },
  ]

  const agentSteps: unknown[] = []

  for (let i = 0; i < maxSteps; i++) {
    const msg = await chatCompletion(tenantId, messages, { tools: tools.length ? tools : undefined })
    const toolCalls = (msg as { tool_calls?: { id: string; function: { name: string; arguments: string } }[] }).tool_calls

    if (!toolCalls?.length) {
      const text = String((msg as { content?: string }).content ?? '')
      return { text, steps: agentSteps }
    }

    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: toolCalls })

    for (const tc of toolCalls) {
      let result = ''
      if (tc.function.name === 'search_knowledge' && kbaseId) {
        const args = JSON.parse(tc.function.arguments || '{}') as { query?: string }
        const q = args.query || userPrompt
        const hits = await searchKnowledge(tenantId, kbaseId, q, 5)
        result = JSON.stringify(hits.chunks)
        agentSteps.push({ tool: 'search_knowledge', query: q, hits: hits.chunks.length })
      } else if (tc.function.name === 'http_request') {
        const args = JSON.parse(tc.function.arguments || '{}') as { url?: string; method?: string; body?: string }
        const url = String(args.url ?? '')
        if (!url) result = JSON.stringify({ error: 'missing url' })
        else {
          const r = await fetch(url, {
            method: (args.method ?? 'GET').toUpperCase(),
            headers: { 'Content-Type': 'application/json' },
            body: args.body && args.method !== 'GET' ? args.body : undefined,
          })
          const text = await r.text()
          result = JSON.stringify({ status: r.status, body: text.slice(0, 4000) })
          agentSteps.push({ tool: 'http_request', url, status: r.status })
        }
      } else {
        result = JSON.stringify({ error: 'unknown tool' })
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result } as never)
    }
  }

  const final = await chatCompletion(tenantId, messages)
  return { text: String((final as { content?: string }).content ?? ''), steps: agentSteps }
}

export async function executeNode(
  tenantId: string,
  node: WorkflowNode,
  ctx: RunContext,
): Promise<unknown> {
  const cfg = node.config ?? {}

  if (node.type.startsWith('trigger.')) {
    return { ...ctx.trigger }
  }

  if (node.type === 'logic.if') {
    const branch = evaluateCondition(ctx, cfg as { left?: string; operator?: string; right?: string })
    return { branch, evaluated: true }
  }

  if (node.type === 'logic.switch') {
    const value = renderTemplate(String(cfg.value ?? ''), ctx)
    const cases = (cfg.cases ?? []) as { match: string; id: string }[]
    for (const c of cases) {
      const m = String(c.match ?? '')
      if (m && (value === m || value.includes(m))) {
        return { matched: c.id || `case_${cases.indexOf(c)}`, value }
      }
    }
    return { matched: 'default', value }
  }

  if (node.type === 'logic.loop') {
    const items = parseLoopItems(cfg, ctx)
    const itemVar = String(cfg.itemVar ?? 'item')
    return { items, count: items.length, itemVar, mode: 'loop' }
  }

  if (node.type === 'logic.set') {
    const vars = (cfg.variables ?? {}) as Record<string, string>
    for (const [k, v] of Object.entries(vars)) {
      ctx.vars[k] = renderTemplate(v, ctx)
    }
    return { vars: { ...ctx.vars } }
  }

  if (node.type === 'logic.delay') {
    const ms = Math.min(Number(cfg.ms ?? 300), 30_000)
    await new Promise((r) => setTimeout(r, ms))
    return { delayedMs: ms }
  }

  if (node.type === 'logic.parallel') {
    return { mode: 'parallel' }
  }

  if (node.type === 'logic.merge') {
    return { merged: true, steps: { ...ctx.steps }, mode: String(cfg.mode ?? 'all') }
  }

  if (node.type === 'workflow.sub') {
    const targetId = String(cfg.targetWorkflowId ?? '')
    if (!targetId) throw new Error('子工作流未选择目标')
    const depth = Number(ctx.vars.__sub_depth ?? 0)
    if (depth >= Number(cfg.maxDepth ?? 3)) throw new Error('子工作流嵌套过深')
    const inputVars = (cfg.inputMapping ?? {}) as Record<string, string>
    const triggerData: Record<string, unknown> = { ...ctx.trigger }
    for (const [k, v] of Object.entries(inputVars)) {
      triggerData[k] = renderTemplate(v, ctx)
    }
    const sub = await runWorkflow({
      tenantId,
      workflowId: targetId,
      triggerType: 'workflow.sub',
      triggerData,
      parentExecutionId: String(ctx.vars.__execution_id ?? ''),
      subDepth: depth + 1,
    })
    return { subExecutionId: sub.executionId, status: sub.status }
  }

  if (node.type === 'ai.knowledge') {
    const kbaseId = String(cfg.kbaseId ?? '')
    const query = renderTemplate(String(cfg.query ?? '{{trigger.content}}'), ctx)
    if (!kbaseId) throw new Error('知识库节点未选择知识库')
    return searchKnowledge(tenantId, kbaseId, query, Number(cfg.topK ?? 5))
  }

  if (node.type === 'ai.chat') {
    const systemPrompt = renderTemplate(String(cfg.systemPrompt ?? ''), ctx)
    const userPrompt = renderTemplate(String(cfg.userPrompt ?? '{{trigger.content}}'), ctx)
    const msg = await chatCompletion(tenantId, [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: userPrompt },
    ], { model: cfg.model ? String(cfg.model) : undefined })
    const text = String((msg as { content?: string }).content ?? '')
    return { text, model: cfg.model }
  }

  if (node.type === 'ai.agent') {
    return executeAgent(tenantId, node, ctx)
  }

  if (node.type === 'http.request') {
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
  }

  if (node.type === 'channel.send') {
    const channel = String(cfg.channel ?? ctx.trigger.channel ?? 'wecom')
    const content = renderTemplate(String(cfg.content ?? ''), ctx)
    if (!content) throw new Error('消息推送节点缺少内容')

    if (channel === 'wecom') {
      const chCfg = (await db.getChannelConfig(tenantId))?.wecom
      if (!chCfg) throw new Error('企业微信未配置')
      const toUser = renderTemplate(String(cfg.toUser ?? ctx.trigger.fromId ?? ''), ctx)
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
  }

  return { ok: true, type: node.type }
}

export async function runWorkflow(input: {
  tenantId: string
  workflowId: string
  triggerType: string
  triggerData: Record<string, unknown>
  userId?: string
  parentExecutionId?: string
  subDepth?: number
}): Promise<{ executionId: string; status: 'success' | 'failed' }> {
  const wf = await db.findWorkflowWithDefinition(input.tenantId, input.workflowId)
  if (!wf) throw new Error('工作流不存在')

  const def: WorkflowDefinition = wf.definition ?? { nodes: [], edges: [] }
  const execution = await db.createExecution({
    tenantId: input.tenantId,
    workflowId: input.workflowId,
    triggerType: input.triggerType,
    triggerData: input.triggerData,
    parentExecutionId: input.parentExecutionId,
  })

  const ctx: RunContext = {
    trigger: input.triggerData,
    steps: {},
    vars: {
      __execution_id: execution.id,
      __sub_depth: input.subDepth ?? 0,
    },
  }

  const queue = findStartNodes(def).map((n) => n.id)
  const visited = new Set<string>()
  let failed = false
  let lastError = ''

  while (queue.length && !failed) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = def.nodes.find((n) => n.id === nodeId)
    if (!node) continue

    const step = await db.createExecutionStep({
      executionId: execution.id,
      nodeId: node.id,
      nodeType: node.type,
      nodeLabel: node.label,
      input: { trigger: ctx.trigger, vars: ctx.vars, priorSteps: { ...ctx.steps } },
    })

    try {
      const output = await executeNode(input.tenantId, node, ctx)
      ctx.steps[node.id] = output
      await db.finishExecutionStep(step.id, 'success', output, null)

      if (node.type === 'channel.send' && ctx.trigger.conversationId) {
        const content = renderTemplate(String(node.config?.content ?? ''), ctx)
        await db.insertMessage(
          input.tenantId,
          String(ctx.trigger.conversationId),
          'out',
          'workflow',
          content,
          { executionId: execution.id, nodeId: node.id },
          '工作流',
        )
      }

      if (node.type === 'logic.loop') {
        const loopOut = output as { items?: unknown[]; itemVar?: string }
        const items = loopOut.items ?? []
        const itemVar = loopOut.itemVar ?? 'item'
        const bodyStarts = branchTargets(node.id, 'each', def.edges)
        for (let i = 0; i < items.length; i++) {
          ctx.vars[itemVar] = items[i]
          ctx.vars.loop_index = i
          const sub = await runSubgraph({
            tenantId: input.tenantId,
            executionId: execution.id,
            def,
            startIds: bodyStarts,
            ctx,
          })
          if (sub.failed) {
            failed = true
            lastError = sub.error
            break
          }
        }
        if (!failed) {
          for (const nextId of branchTargets(node.id, 'done', def.edges)) {
            if (!visited.has(nextId)) queue.push(nextId)
          }
        }
        continue
      }

      if (node.type === 'logic.parallel') {
        const branchStarts = def.edges.filter((e) => e.source === node.id).map((e) => e.target)
        const mergeId = findMergeNodeId(node.id, def)
        const stopSet = mergeId ? new Set([mergeId]) : new Set<string>()
        const results = await Promise.all(
          branchStarts.map((startId) =>
            runSubgraph({
              tenantId: input.tenantId,
              executionId: execution.id,
              def,
              startIds: [startId],
              ctx: { trigger: { ...ctx.trigger }, steps: { ...ctx.steps }, vars: { ...ctx.vars } },
              stopBeforeNodeIds: stopSet,
            }),
          ),
        )
        const bad = results.find((r) => r.failed)
        if (bad) {
          failed = true
          lastError = bad.error
        } else if (mergeId && !visited.has(mergeId)) {
          queue.push(mergeId)
        } else {
          for (const nextId of nextNodeIds(node, output, def.edges)) {
            if (!visited.has(nextId)) queue.push(nextId)
          }
        }
        continue
      }

      for (const nextId of nextNodeIds(node, output, def.edges)) {
        if (!visited.has(nextId)) queue.push(nextId)
      }
    } catch (e) {
      failed = true
      lastError = e instanceof Error ? e.message : String(e)
      await db.finishExecutionStep(step.id, 'failed', null, lastError)
    }
  }

  await db.finishExecution(execution.id, failed ? 'failed' : 'success', failed ? lastError : null)
  return { executionId: execution.id, status: failed ? 'failed' : 'success' }
}

export function workflowHasTrigger(def: WorkflowDefinition, triggerType: string): boolean {
  return def.nodes.some((n) => n.type === triggerType)
}

export async function triggerMatchingWorkflows(
  tenantId: string,
  triggerType: string,
  triggerData: Record<string, unknown>,
): Promise<string[]> {
  const workflows = await db.listPublishedWorkflows(tenantId)
  const jobIds: string[] = []
  for (const wf of workflows) {
    const def = wf.definition ?? { nodes: [], edges: [] }
    if (workflowHasTrigger(def, triggerType)) {
      const job = await db.enqueueExecutionJob({
        tenantId,
        workflowId: wf.id,
        triggerType,
        triggerData,
      })
      jobIds.push(job.id)
    }
  }
  return jobIds
}

export async function syncWorkflowTriggers(
  tenantId: string,
  workflowId: string,
  def: WorkflowDefinition,
): Promise<void> {
  await db.clearWorkflowTriggers(tenantId, workflowId)
  for (const node of def.nodes) {
    if (node.type === 'trigger.webhook') {
      const path = String(node.config?.path ?? '').trim()
      if (path) {
        await db.upsertWorkflowTrigger({
          tenantId,
          workflowId,
          nodeId: node.id,
          type: 'webhook',
          config: { path },
        })
      }
    }
    if (node.type === 'trigger.cron') {
      const cron = String(node.config?.cron ?? '').trim()
      if (cron) {
        await db.upsertWorkflowTrigger({
          tenantId,
          workflowId,
          nodeId: node.id,
          type: 'cron',
          config: { cron, timezone: node.config?.timezone ?? 'Asia/Shanghai' },
        })
      }
    }
  }
}

export { createEmbedding }
