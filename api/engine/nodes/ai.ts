import { db } from '../../store.js'
import { renderTemplate } from '../template.js'
import { chatCompletion } from '../llm.js'
import { createEmbedding } from '../llm.js'
import type { NodeExecutor } from './registry.js'

export async function searchKnowledge(
  tenantId: string,
  kbaseId: string,
  query: string,
  limit = 5,
): Promise<{ chunks: { id: string; content: string; title: string; score: number }[]; mode: 'vector' | 'keyword' | 'hybrid' }> {
  try {
    const hits = await db.searchKnowledgeChunksHybrid(tenantId, kbaseId, query, limit)
    if (hits.length) return { chunks: hits, mode: 'hybrid' as const }
  } catch { /* fallback */ }
  const vectorHits = await db.searchKnowledgeChunksVector(tenantId, kbaseId, query, limit).catch(() => [])
  if (vectorHits.length) return { chunks: vectorHits, mode: 'vector' as const }
  const chunks = await db.searchKnowledgeChunks(tenantId, kbaseId, query, limit)
  return { chunks, mode: 'keyword' as const }
}

function buildMessages(ctx: { trigger: Record<string, unknown> }, systemPrompt: string, userPrompt: string): { role: string; content: string }[] {
  const msgs: { role: string; content: string }[] = []
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })

  const history = (ctx.trigger.chatHistory ?? []) as { role: string; content: string }[] | undefined
  if (Array.isArray(history) && history.length) {
    for (const h of history) {
      if (h.role === 'user' || h.role === 'assistant') {
        msgs.push({ role: h.role, content: h.content })
      }
    }
  }

  msgs.push({ role: 'user', content: userPrompt })
  return msgs
}

export const aiKnowledge: NodeExecutor = {
  type: 'ai.knowledge',
  async execute({ tenantId, node, ctx }) {
    const cfg = node.config ?? {}
    const kbaseId = String(cfg.kbaseId ?? '')
    const query = renderTemplate(String(cfg.query ?? '{{trigger.content}}'), ctx)
    if (!kbaseId) throw new Error('知识库节点未选择知识库')
    return searchKnowledge(tenantId, kbaseId, query, Number(cfg.topK ?? 5))
  },
}

export const aiChat: NodeExecutor = {
  type: 'ai.chat',
  async execute({ tenantId, node, ctx }) {
    const cfg = node.config ?? {}
    const systemPrompt = renderTemplate(String(cfg.systemPrompt ?? ''), ctx)
    const userPrompt = renderTemplate(String(cfg.userPrompt ?? '{{trigger.content}}'), ctx)
    const messages = buildMessages(ctx, systemPrompt, userPrompt)
    const msg = await chatCompletion(tenantId, messages, { model: cfg.model ? String(cfg.model) : undefined })
    const text = String((msg as { content?: string }).content ?? '')
    return { text, model: cfg.model }
  },
}

async function executeAgent(
  tenantId: string,
  node: { config?: Record<string, unknown> },
  systemPrompt: string,
  userPrompt: string,
  hasKbaseId: string,
  enableHttp: boolean,
  chatHistory: { role: string; content: string }[],
): Promise<{ text: string; steps: unknown[] }> {
  const cfg = node.config ?? {}
  const kbaseId = hasKbaseId
  const maxSteps = Math.min(Number(cfg.maxSteps ?? 4), 8)

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
  if (enableHttp) {
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
  ]
  for (const h of chatHistory) {
    if (h.role === 'user' || h.role === 'assistant') {
      messages.push({ role: h.role, content: h.content })
    }
  }
  messages.push({ role: 'user', content: userPrompt })

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

export const aiAgent: NodeExecutor = {
  type: 'ai.agent',
  async execute({ tenantId, node, ctx }) {
    const cfg = node.config ?? {}
    const kbaseId = String(cfg.kbaseId ?? '')
    const systemPrompt = renderTemplate(String(cfg.systemPrompt ?? ''), ctx)
    const userPrompt = renderTemplate(String(cfg.userPrompt ?? '{{trigger.content}}'), ctx)
    const enableHttp = cfg.enableHttp !== false
    const history = (ctx.trigger.chatHistory ?? []) as { role: string; content: string }[]
    return executeAgent(tenantId, node, systemPrompt, userPrompt, kbaseId, enableHttp, history)
  },
}

export { createEmbedding }
