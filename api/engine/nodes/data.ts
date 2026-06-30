import { renderTemplate } from '../template.js'
import type { NodeExecutor } from './registry.js'

export const logicJsonParse: NodeExecutor = {
  type: 'logic.json.parse',
  async execute({ node, ctx }) {
    const cfg = node.config ?? {}
    const input = renderTemplate(String(cfg.input ?? '{{trigger.content}}'), ctx)
    try {
      const parsed = JSON.parse(input)
      return { parsed, type: typeof parsed }
    } catch {
      return { parsed: null, error: 'JSON 解析失败', raw: input.slice(0, 500) }
    }
  },
}

export const logicSplit: NodeExecutor = {
  type: 'logic.split',
  async execute({ node, ctx }) {
    const cfg = node.config ?? {}
    const input = renderTemplate(String(cfg.input ?? ''), ctx)
    const separator = String(cfg.separator ?? ',')
    let items: unknown[]
    if (separator && input.includes(separator)) {
      items = input.split(separator).map((s) => s.trim()).filter(Boolean)
    } else {
      try {
        const parsed = JSON.parse(input)
        items = Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        items = input ? [input] : []
      }
    }
    return { items, count: items.length }
  },
}

export const logicJoin: NodeExecutor = {
  type: 'logic.join',
  async execute({ node, ctx }) {
    const cfg = node.config ?? {}
    const raw = renderTemplate(String(cfg.items ?? ''), ctx)
    const separator = String(cfg.separator ?? '\n')
    let items: unknown[]
    try {
      const parsed = JSON.parse(raw)
      items = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      items = [raw]
    }
    const result = items.map((i) => (typeof i === 'string' ? i : JSON.stringify(i))).join(separator)
    return { joined: result }
  },
}

export const logicDate: NodeExecutor = {
  type: 'logic.date',
  async execute({ node, ctx }) {
    const cfg = node.config ?? {}
    const val = renderTemplate(String(cfg.value ?? ''), ctx)
    const format = String(cfg.format ?? 'YYYY-MM-DD HH:mm:ss')
    const offsetDays = Number(cfg.offsetDays ?? 0)

    let date: Date
    if (val === 'now' || !val) {
      date = new Date()
    } else {
      const n = Number(val)
      if (!isNaN(n)) {
        date = n > 1e12 ? new Date(n) : new Date(n * 1000)
      } else {
        date = new Date(val)
      }
    }
    if (isNaN(date.getTime())) date = new Date()

    if (offsetDays) date = new Date(date.getTime() + offsetDays * 86400000)

    const pad = (n: number, len = 2) => String(n).padStart(len, '0')
    const formatted = format
      .replace('YYYY', String(date.getFullYear()))
      .replace('MM', pad(date.getMonth() + 1))
      .replace('DD', pad(date.getDate()))
      .replace('HH', pad(date.getHours()))
      .replace('mm', pad(date.getMinutes()))
      .replace('ss', pad(date.getSeconds()))
      .replace('WW', ['日', '一', '二', '三', '四', '五', '六'][date.getDay()])

    return { iso: date.toISOString(), timestamp: date.getTime(), formatted, offsetDays }
  },
}
