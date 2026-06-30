import { renderTemplate } from '../template.js'
import { evaluateCondition } from '../evaluate.js'
import { parseLoopItems } from '../graph.js'
import type { NodeExecutor } from './registry.js'
import type { RunContext } from '../types.js'

type RunWorkflowFn = (input: {
  tenantId: string
  workflowId: string
  triggerType: string
  triggerData: Record<string, unknown>
  userId?: string
  parentExecutionId?: string
  subDepth?: number
}) => Promise<{ executionId: string; status: 'success' | 'failed' }>

let getRunWorkflow: (() => RunWorkflowFn) | null = null

export function injectRunWorkflow(fn: () => RunWorkflowFn) {
  getRunWorkflow = fn
}

export const logicIf: NodeExecutor = {
  type: 'logic.if',
  async execute({ node, ctx }) {
    const cfg = node.config ?? {}
    const branch = evaluateCondition(ctx, cfg as { left?: string; operator?: string; right?: string })
    return { branch, evaluated: true }
  },
}

export const logicSwitch: NodeExecutor = {
  type: 'logic.switch',
  async execute({ node, ctx }) {
    const cfg = node.config ?? {}
    const value = renderTemplate(String(cfg.value ?? ''), ctx)
    const cases = (cfg.cases ?? []) as { match: string; id: string }[]
    for (const c of cases) {
      const m = String(c.match ?? '')
      if (m && (value === m || value.includes(m))) {
        return { matched: c.id || `case_${cases.indexOf(c)}`, value }
      }
    }
    return { matched: 'default', value }
  },
}

export const logicLoop: NodeExecutor = {
  type: 'logic.loop',
  structural: true,
  async execute({ node, ctx }) {
    const cfg = node.config ?? {}
    const items = parseLoopItems(cfg, ctx)
    const itemVar = String(cfg.itemVar ?? 'item')
    return { items, count: items.length, itemVar, mode: 'loop' }
  },
}

export const logicSet: NodeExecutor = {
  type: 'logic.set',
  async execute({ node, ctx }) {
    const cfg = node.config ?? {}
    const vars = (cfg.variables ?? {}) as Record<string, string>
    for (const [k, v] of Object.entries(vars)) {
      ctx.vars[k] = renderTemplate(v, ctx)
    }
    return { vars: { ...ctx.vars } }
  },
}

export const logicDelay: NodeExecutor = {
  type: 'logic.delay',
  async execute({ node }) {
    const cfg = node.config ?? {}
    const ms = Math.min(Number(cfg.ms ?? 300), 30_000)
    await new Promise((r) => setTimeout(r, ms))
    return { delayedMs: ms }
  },
}

export const logicParallel: NodeExecutor = {
  type: 'logic.parallel',
  structural: true,
  async execute() {
    return { mode: 'parallel' }
  },
}

export const logicMerge: NodeExecutor = {
  type: 'logic.merge',
  structural: true,
  async execute({ node, ctx }) {
    const cfg = node.config ?? {}
    return { merged: true, steps: { ...ctx.steps }, mode: String(cfg.mode ?? 'all') }
  },
}

export const workflowSub: NodeExecutor = {
  type: 'workflow.sub',
  async execute({ tenantId, node, ctx }) {
    if (!getRunWorkflow) throw new Error('runWorkflow 尚未初始化')
    const cfg = node.config ?? {}
    const targetId = String(cfg.targetWorkflowId ?? '')
    if (!targetId) throw new Error('子工作流未选择目标')
    const depth = Number(ctx.vars.__sub_depth ?? 0)
    if (depth >= Number(cfg.maxDepth ?? 3)) throw new Error('子工作流嵌套过深')
    const inputVars = (cfg.inputMapping ?? {}) as Record<string, string>
    const triggerData: Record<string, unknown> = { ...ctx.trigger }
    for (const [k, v] of Object.entries(inputVars)) {
      triggerData[k] = renderTemplate(v, ctx)
    }
    const sub = await getRunWorkflow()({
      tenantId,
      workflowId: targetId,
      triggerType: 'workflow.sub',
      triggerData,
      parentExecutionId: String(ctx.vars.__execution_id ?? ''),
      subDepth: depth + 1,
    })
    return { subExecutionId: sub.executionId, status: sub.status }
  },
}
