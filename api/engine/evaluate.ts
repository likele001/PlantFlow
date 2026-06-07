import { renderTemplate } from './template.js'
import type { RunContext } from './types.js'

type Op = 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'not_empty' | 'empty' | 'gt' | 'lt'

export function evaluateCondition(
  ctx: RunContext,
  cfg: { left?: string; operator?: string; right?: string },
): boolean {
  const left = renderTemplate(String(cfg.left ?? ''), ctx)
  const right = renderTemplate(String(cfg.right ?? ''), ctx)
  const op = (cfg.operator ?? 'not_empty') as Op

  switch (op) {
    case 'equals':
      return left === right
    case 'not_equals':
      return left !== right
    case 'contains':
      return left.includes(right)
    case 'not_contains':
      return !left.includes(right)
    case 'empty':
      return !left.trim()
    case 'not_empty':
      return !!left.trim()
    case 'gt':
      return Number(left) > Number(right)
    case 'lt':
      return Number(left) < Number(right)
    default:
      return !!left.trim()
  }
}
