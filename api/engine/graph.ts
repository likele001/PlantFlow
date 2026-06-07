import { renderTemplate } from './template.js'
import type { WorkflowDefinition, WorkflowNode, RunContext } from './types.js'

export function findStartNodes(def: WorkflowDefinition): WorkflowNode[] {
  const triggers = def.nodes.filter((n) => n.type.startsWith('trigger.'))
  if (triggers.length) return triggers
  const targets = new Set(def.edges.map((e) => e.target))
  return def.nodes.filter((n) => !targets.has(n.id))
}

export function nextNodeIds(
  node: WorkflowNode,
  output: unknown,
  edges: WorkflowDefinition['edges'],
): string[] {
  const out = edges.filter((e) => e.source === node.id)
  if (!out.length) return []

  if (node.type === 'logic.if') {
    const branch = Boolean((output as { branch?: boolean })?.branch)
    const handle = branch ? 'true' : 'false'
    const matched = out.filter((e) => e.sourceHandle === handle)
    if (matched.length) return matched.map((e) => e.target)
    if (out.length === 1) return branch ? [out[0].target] : []
    return branch ? [out[0].target] : [out[1]?.target].filter(Boolean) as string[]
  }

  if (node.type === 'logic.switch') {
    const matched = String((output as { matched?: string })?.matched ?? 'default')
    const hits = out.filter((e) => e.sourceHandle === matched)
    if (hits.length) return hits.map((e) => e.target)
    const def = out.filter((e) => e.sourceHandle === 'default')
    if (def.length) return def.map((e) => e.target)
    return out.filter((e) => !e.sourceHandle).map((e) => e.target)
  }

  if (node.type === 'logic.loop') {
    return out.filter((e) => e.sourceHandle === 'done').map((e) => e.target)
  }

  if (node.type === 'logic.parallel') {
    return out.map((e) => e.target)
  }

  if (node.type === 'logic.merge') {
    return out.map((e) => e.target)
  }

  return out.filter((e) => !e.sourceHandle || e.sourceHandle === 'default').map((e) => e.target)
}

export function findMergeNodeId(
  parallelNodeId: string,
  def: WorkflowDefinition,
): string | null {
  const cfg = def.nodes.find((n) => n.id === parallelNodeId)?.config as { mergeNodeId?: string } | undefined
  if (cfg?.mergeNodeId) return String(cfg.mergeNodeId)
  const branchTargets = def.edges.filter((e) => e.source === parallelNodeId).map((e) => e.target)
  const mergeNodes = def.nodes.filter((n) => n.type === 'logic.merge')
  for (const m of mergeNodes) {
    const parents = def.edges.filter((e) => e.target === m.id).map((e) => e.source)
    if (branchTargets.some((b) => parents.includes(b) || reachesNode(b, m.id, def))) {
      return m.id
    }
  }
  return mergeNodes[0]?.id ?? null
}

function reachesNode(fromId: string, toId: string, def: WorkflowDefinition, seen = new Set<string>()): boolean {
  if (fromId === toId) return true
  if (seen.has(fromId)) return false
  seen.add(fromId)
  const next = def.edges.filter((e) => e.source === fromId).map((e) => e.target)
  return next.some((n) => reachesNode(n, toId, def, seen))
}

export function branchTargets(
  nodeId: string,
  handle: string,
  edges: WorkflowDefinition['edges'],
): string[] {
  return edges.filter((e) => e.source === nodeId && e.sourceHandle === handle).map((e) => e.target)
}

export function parseLoopItems(cfg: Record<string, unknown>, ctx: RunContext): unknown[] {
  const raw = renderTemplate(String(cfg.items ?? '[]'), ctx)
  let items: unknown[] = []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) items = parsed
    else items = [parsed]
  } catch {
    items = raw.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean)
  }
  const max = Math.min(Number(cfg.maxIterations ?? 50), 100)
  return items.slice(0, max)
}
