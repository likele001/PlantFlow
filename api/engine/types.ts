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
  /** logic.if: 'true' | 'false'; default handle omitted */
  sourceHandle?: string
}

export type WorkflowDefinition = {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export type ExecutionStatus = 'running' | 'success' | 'failed' | 'cancelled'
export type StepStatus = 'running' | 'success' | 'failed' | 'skipped'

export type RunContext = {
  trigger: Record<string, unknown>
  steps: Record<string, unknown>
  vars: Record<string, unknown>
}
