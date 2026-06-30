// engine/types.ts

export interface WorkflowDefinition {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface WorkflowNode {
  id: string
  type: string
  label?: string
  config?: Record<string, unknown>
  position?: { x: number; y: number }
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  label?: string
}

export interface RunContext {
  trigger: Record<string, unknown>
  steps: Record<string, unknown>
  vars: Record<string, unknown>
  loopIndex: number
  loopItem: unknown
  store?: Record<string, unknown>
}
