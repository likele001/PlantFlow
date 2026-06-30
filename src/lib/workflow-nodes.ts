export type WorkflowNode = {
  id: string
  type: string
  label: string
  config: Record<string, unknown>
  position?: { x: number; y: number }
}

export type WorkflowEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
}

export type WorkflowDefinition = {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export type NodePaletteItem = {
  type: string
  label: string
  group: string
  color: string
  outputs?: number | 'branch'
}

export const NODE_PALETTE: NodePaletteItem[] = [
  { type: 'trigger.manual', label: '手动触发', group: '触发器', color: '#6366f1' },
  { type: 'trigger.webhook', label: 'Webhook', group: '触发器', color: '#8b5cf6' },
  { type: 'trigger.cron', label: '定时任务', group: '触发器', color: '#a855f7' },
  { type: 'trigger.wecom', label: '企业微信', group: '触发器', color: '#22c55e' },
  { type: 'trigger.feishu', label: '飞书', group: '触发器', color: '#3b82f6' },
  { type: 'logic.if', label: '条件分支', group: '逻辑', color: '#f59e0b', outputs: 'branch' },
  { type: 'logic.switch', label: '多路分支', group: '逻辑', color: '#f97316', outputs: 'branch' },
  { type: 'logic.loop', label: '循环遍历', group: '逻辑', color: '#fb923c', outputs: 'branch' },
  { type: 'logic.parallel', label: '并行分支', group: '逻辑', color: '#38bdf8', outputs: 'branch' },
  { type: 'logic.merge', label: '汇合', group: '逻辑', color: '#0ea5e9' },
  { type: 'workflow.sub', label: '子工作流', group: '逻辑', color: '#6366f1' },
  { type: 'logic.set', label: '设置变量', group: '逻辑', color: '#eab308' },
  { type: 'trigger.chat', label: '对话触发', group: '触发器', color: '#c084fc' },
  { type: 'logic.delay', label: '延迟', group: '逻辑', color: '#94a3b8' },
  { type: 'logic.code', label: 'Code', group: '逻辑', color: '#8b5cf6' },
  { type: 'logic.try', label: 'Try/Catch', group: '逻辑', color: '#f97316', outputs: 'branch' },
  { type: 'logic.json.parse', label: 'JSON 解析', group: '逻辑', color: '#22d3ee' },
  { type: 'logic.split', label: '拆分', group: '逻辑', color: '#a78bfa' },
  { type: 'logic.join', label: '合并文本', group: '逻辑', color: '#c084fc' },
  { type: 'logic.date', label: '日期处理', group: '逻辑', color: '#fbbf24' },
  { type: 'ai.chat', label: 'AI 对话', group: 'AI', color: '#ec4899' },
  { type: 'ai.knowledge', label: '知识库检索', group: 'AI', color: '#f472b6' },
  { type: 'ai.agent', label: 'AI Agent', group: 'AI', color: '#db2777' },
  { type: 'http.request', label: 'HTTP', group: '集成', color: '#0ea5e9' },
  { type: 'channel.send', label: '消息推送', group: '集成', color: '#14b8a6' },
]

export function defaultNodeConfig(type: string): Record<string, unknown> {
  switch (type) {
    case 'trigger.webhook':
      return { path: crypto.randomUUID().slice(0, 8) }
    case 'trigger.cron':
      return { cron: '0 9 * * *', timezone: 'Asia/Shanghai' }
    case 'logic.if':
      return { left: '{{trigger.content}}', operator: 'contains', right: '告警' }
    case 'logic.switch':
      return {
        value: '{{trigger.content}}',
        cases: [
          { match: '告警', id: 'case_0' },
          { match: '报工', id: 'case_1' },
        ],
      }
    case 'logic.loop':
      return { items: '["A","B"]', itemVar: 'item', maxIterations: 20 }
    case 'logic.parallel':
      return { mergeNodeId: '' }
    case 'logic.merge':
      return { mode: 'all' }
    case 'workflow.sub':
      return { targetWorkflowId: '', inputMapping: { content: '{{trigger.content}}' }, maxDepth: 3 }
    case 'logic.set':
      return { variables: { reply: '{{steps.__last__.text}}' } }
    case 'logic.delay':
      return { ms: 300 }
    case 'logic.code':
      return { code: 'const result = $.trigger.content\nreturn result', timeout: 5000 }
    case 'logic.try':
      return {}
    case 'logic.json.parse':
      return { input: '{{trigger.content}}' }
    case 'logic.split':
      return { input: '{{trigger.content}}', separator: ',' }
    case 'logic.join':
      return { items: '{{steps.__last__.items}}', separator: '\n' }
    case 'logic.date':
      return { value: 'now', format: 'YYYY-MM-DD HH:mm:ss', offsetDays: 0 }
    case 'ai.chat':
      return { systemPrompt: '你是高效简洁的中文工厂智能助手。', userPrompt: '{{trigger.content}}' }
    case 'ai.knowledge':
      return { kbaseId: '', query: '{{trigger.content}}', topK: 5 }
    case 'ai.agent':
      return { systemPrompt: '你是工厂智能助手。', userPrompt: '{{trigger.content}}', kbaseId: '', maxSteps: 4 }
    case 'http.request':
      return { url: 'https://', method: 'GET', body: '' }
    case 'channel.send':
      return { channel: 'wecom', content: '{{steps.__last__.text}}' }
    default:
      return {}
  }
}
