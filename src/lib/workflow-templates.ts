import type { WorkflowDefinition } from '@/lib/workflow-nodes'
import { defaultNodeConfig } from '@/lib/workflow-nodes'

export type WorkflowTemplate = {
  id: string
  name: string
  description: string
  build: () => WorkflowDefinition
}

function nid() {
  return crypto.randomUUID()
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'ai-chat',
    name: 'AI 智能问答',
    description: '手动触发 → AI 对话',
    build: () => {
      const t = nid()
      const a = nid()
      return {
        nodes: [
          { id: t, type: 'trigger.manual', label: '手动触发', config: {}, position: { x: 80, y: 120 } },
          {
            id: a,
            type: 'ai.chat',
            label: 'AI 对话',
            config: defaultNodeConfig('ai.chat'),
            position: { x: 320, y: 120 },
          },
        ],
        edges: [{ id: `e-${t}-${a}`, source: t, target: a }],
      }
    },
  },
  {
    id: 'rag',
    name: '知识库 RAG',
    description: '检索知识库 → AI 汇总回答',
    build: () => {
      const t = nid()
      const k = nid()
      const a = nid()
      return {
        nodes: [
          { id: t, type: 'trigger.manual', label: '手动触发', config: {}, position: { x: 60, y: 140 } },
          {
            id: k,
            type: 'ai.knowledge',
            label: '知识库检索',
            config: defaultNodeConfig('ai.knowledge'),
            position: { x: 280, y: 140 },
          },
          {
            id: a,
            type: 'ai.chat',
            label: 'AI 汇总',
            config: {
              ...defaultNodeConfig('ai.chat'),
              userPrompt: '根据检索结果回答：{{trigger.content}}\n\n检索片段：{{steps.__last__.chunks}}',
            },
            position: { x: 520, y: 140 },
          },
        ],
        edges: [
          { id: `e-${t}-${k}`, source: t, target: k },
          { id: `e-${k}-${a}`, source: k, target: a },
        ],
      }
    },
  },
  {
    id: 'daily-feishu-report',
    name: '每日飞书日报',
    description: '每天 9:00 拉数据 → AI 汇总 → 发飞书群',
    build: () => {
      const t = nid()
      const h = nid()
      const a = nid()
      const s = nid()
      return {
        nodes: [
          {
            id: t,
            type: 'trigger.cron',
            label: '每天 9:00',
            config: { cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
            position: { x: 60, y: 160 },
          },
          {
            id: h,
            type: 'http.request',
            label: '拉取业务数据',
            config: {
              ...defaultNodeConfig('http.request'),
              url: 'https://你的系统/api/daily-stats',
              method: 'GET',
            },
            position: { x: 280, y: 160 },
          },
          {
            id: a,
            type: 'ai.chat',
            label: 'AI 汇总日报',
            config: {
              systemPrompt: '你是工厂运营数据分析助手，把 JSON 数据整理成简洁的中文日报，含：标题、核心指标、异常提醒、建议。',
              userPrompt:
                '统计时间：{{trigger.firedAt}}\n\n原始数据：\n{{steps.' + h + '.body}}\n\n请输出可直接发到飞书群的日报正文。',
            },
            position: { x: 500, y: 160 },
          },
          {
            id: s,
            type: 'channel.send',
            label: '发飞书群',
            config: {
              channel: 'feishu',
              receiveId: '',
              content: '📊 每日运营汇总（{{trigger.firedAt}}）\n\n{{steps.__last__.text}}',
            },
            position: { x: 720, y: 160 },
          },
        ],
        edges: [
          { id: `e-${t}-${h}`, source: t, target: h },
          { id: `e-${h}-${a}`, source: h, target: a },
          { id: `e-${a}-${s}`, source: a, target: s },
        ],
      }
    },
  },
  {
    id: 'webhook-alert',
    name: 'Webhook 告警',
    description: 'Webhook → 条件判断 → 推送消息',
    build: () => {
      const t = nid()
      const i = nid()
      const s = nid()
      return {
        nodes: [
          { id: t, type: 'trigger.webhook', label: 'Webhook', config: defaultNodeConfig('trigger.webhook'), position: { x: 60, y: 160 } },
          {
            id: i,
            type: 'logic.if',
            label: '含告警?',
            config: defaultNodeConfig('logic.if'),
            position: { x: 300, y: 160 },
          },
          {
            id: s,
            type: 'channel.send',
            label: '推送告警',
            config: defaultNodeConfig('channel.send'),
            position: { x: 560, y: 100 },
          },
        ],
        edges: [
          { id: `e-${t}-${i}`, source: t, target: i },
          { id: `e-${i}-${s}`, source: i, target: s, sourceHandle: 'true' },
        ],
      }
    },
  },
]
