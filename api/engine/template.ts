import type { RunContext } from './types.js'

function getPath(ctx: RunContext, path: string): unknown {
  const parts = path.split('.')
  if (parts[0] === 'trigger') {
    let cur: unknown = ctx.trigger
    for (const p of parts.slice(1)) {
      if (cur == null || typeof cur !== 'object') return ''
      cur = (cur as Record<string, unknown>)[p]
    }
    return cur ?? ''
  }
  if (parts[0] === 'steps' && parts.length >= 2) {
    let nodeId = parts[1]
    if (nodeId === '__last__') {
      const keys = Object.keys(ctx.steps)
      nodeId = keys[keys.length - 1] ?? ''
    }
    let cur: unknown = ctx.steps[nodeId]
    for (const p of parts.slice(2)) {
      if (cur == null || typeof cur !== 'object') return ''
      cur = (cur as Record<string, unknown>)[p]
    }
    return cur ?? ''
  }
  if (parts[0] === 'vars') {
    let cur: unknown = ctx.vars
    for (const p of parts.slice(1)) {
      if (cur == null || typeof cur !== 'object') return ''
      cur = (cur as Record<string, unknown>)[p]
    }
    return cur ?? ''
  }
  return ''
}

export function renderTemplate(template: string, ctx: RunContext): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, key: string) => {
    const v = getPath(ctx, key.trim())
    if (v == null) return ''
    if (typeof v === 'string') return v
    return JSON.stringify(v)
  })
}
