import type { WorkflowDefinition } from '@/lib/workflow-nodes'

/** Simple left-to-right layout (n8n-style horizontal flow) */
export function autoLayout(definition: WorkflowDefinition): WorkflowDefinition {
  const { nodes, edges } = definition
  if (!nodes.length) return definition

  const inDeg = new Map<string, number>()
  const children = new Map<string, string[]>()
  for (const n of nodes) {
    inDeg.set(n.id, 0)
    children.set(n.id, [])
  }
  for (const e of edges) {
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1)
    children.get(e.source)?.push(e.target)
  }

  const triggers = nodes.filter((n) => n.type.startsWith('trigger.'))
  const roots = triggers.length ? triggers.map((n) => n.id) : nodes.filter((n) => (inDeg.get(n.id) ?? 0) === 0).map((n) => n.id)
  if (!roots.length) roots.push(nodes[0].id)

  const depth = new Map<string, number>()
  const queue = [...roots]
  for (const r of roots) depth.set(r, 0)
  while (queue.length) {
    const id = queue.shift()!
    const d = depth.get(id) ?? 0
    for (const c of children.get(id) ?? []) {
      depth.set(c, Math.max(depth.get(c) ?? 0, d + 1))
      queue.push(c)
    }
  }

  const byDepth = new Map<number, string[]>()
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(n.id)
  }

  const pos = new Map<string, { x: number; y: number }>()
  const xGap = 240
  const yGap = 130
  for (const [d, ids] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
    ids.forEach((id, i) => {
      const yOff = (i - (ids.length - 1) / 2) * yGap
      pos.set(id, { x: 80 + d * xGap, y: 140 + yOff })
    })
  }

  return {
    nodes: nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })),
    edges,
  }
}
