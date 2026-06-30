/**
 * Node registry — add new node types here (plugin-style).
 */
export type NodeMeta = {
  type: string
  label: string
  group: '触发器' | '逻辑' | 'AI' | '集成'
  color: string
  outputs?: number | 'branch'
  description?: string
}

export const NODE_REGISTRY: NodeMeta[] = [
  { type: 'trigger.manual', label: '手动触发', group: '触发器', color: '#6366f1', outputs: 1 },
  { type: 'trigger.webhook', label: 'Webhook', group: '触发器', color: '#8b5cf6', outputs: 1, description: 'HTTP 回调触发' },
  { type: 'trigger.cron', label: '定时任务', group: '触发器', color: '#a855f7', outputs: 1, description: 'Cron 表达式' },
  { type: 'trigger.wecom', label: '企业微信消息', group: '触发器', color: '#22c55e', outputs: 1 },
  { type: 'trigger.feishu', label: '飞书消息', group: '触发器', color: '#3b82f6', outputs: 1 },
  { type: 'trigger.taobao', label: '淘宝客服消息', group: '触发器', color: '#ff6a00', outputs: 1, description: '淘宝旺旺聊天消息' },
  { type: 'logic.if', label: '条件分支', group: '逻辑', color: '#f59e0b', outputs: 'branch' },
  { type: 'logic.switch', label: '多路分支', group: '逻辑', color: '#f97316', outputs: 'branch', description: 'Switch 路由' },
  { type: 'logic.loop', label: '循环遍历', group: '逻辑', color: '#fb923c', outputs: 'branch', description: '逐项执行循环体' },
  { type: 'logic.parallel', label: '并行分支', group: '逻辑', color: '#38bdf8', outputs: 'branch', description: '多路并行执行' },
  { type: 'logic.merge', label: '汇合', group: '逻辑', color: '#0ea5e9', outputs: 1, description: '等待并行分支完成' },
  { type: 'workflow.sub', label: '子工作流', group: '逻辑', color: '#6366f1', outputs: 1, description: '调用另一个工作流' },
  { type: 'logic.set', label: '设置变量', group: '逻辑', color: '#eab308', outputs: 1 },
  { type: 'logic.delay', label: '延迟', group: '逻辑', color: '#94a3b8', outputs: 1 },
  { type: 'logic.code', label: 'Code 代码', group: '逻辑', color: '#8b5cf6', outputs: 1, description: '执行 JS 代码' },
  { type: 'logic.try', label: 'Try / Catch', group: '逻辑', color: '#f97316', outputs: 'branch', description: '错误捕获处理' },
  { type: 'logic.json.parse', label: 'JSON 解析', group: '逻辑', color: '#22d3ee', outputs: 1 },
  { type: 'logic.split', label: '拆分', group: '逻辑', color: '#a78bfa', outputs: 1, description: '字符串或数组拆分' },
  { type: 'logic.join', label: '合并文本', group: '逻辑', color: '#c084fc', outputs: 1, description: '数组合并为字符串' },
  { type: 'logic.date', label: '日期处理', group: '逻辑', color: '#fbbf24', outputs: 1, description: '日期格式化与偏移' },
  { type: 'trigger.chat', label: '对话触发', group: '触发器', color: '#c084fc', outputs: 1, description: '对话应用 API' },
  { type: 'ai.chat', label: 'AI 对话', group: 'AI', color: '#ec4899', outputs: 1 },
  { type: 'ai.knowledge', label: '知识库检索', group: 'AI', color: '#f472b6', outputs: 1 },
  { type: 'ai.agent', label: 'AI Agent', group: 'AI', color: '#db2777', outputs: 1, description: '多步推理+工具' },
  { type: 'http.request', label: 'HTTP 请求', group: '集成', color: '#0ea5e9', outputs: 1 },
  { type: 'channel.send', label: '消息推送', group: '集成', color: '#14b8a6', outputs: 1 },
]

export function getNodeMeta(type: string): NodeMeta | undefined {
  return NODE_REGISTRY.find((n) => n.type === type)
}

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
      return { items: '["示例A","示例B"]', itemVar: 'item', maxIterations: 20 }
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
      return { code: '// 访问变量: $.trigger.content, $.steps.xxx.output, $.vars.key\nconst result = $.trigger.content\nreturn result', timeout: 5000 }
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
      return { systemPrompt: '你是高效、简洁的中文工厂智能助手。', userPrompt: '{{trigger.content}}' }
    case 'ai.knowledge':
      return { kbaseId: '', query: '{{trigger.content}}', topK: 5 }
    case 'ai.agent':
      return {
        systemPrompt: '你是工厂智能助手，可检索知识库并回答问题。',
        userPrompt: '{{trigger.content}}',
        kbaseId: '',
        maxSteps: 4,
      }
    case 'http.request':
      return { url: 'https://', method: 'GET', body: '' }
    case 'channel.send':
      return { channel: 'feishu', receiveId: '', content: '【每日汇总】\n{{steps.__last__.text}}' }
    default:
      return {}
  }
}
