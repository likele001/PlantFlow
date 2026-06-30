import type { WorkflowNode, RunContext } from '../types.js'

export interface NodeExecuteContext {
  tenantId: string
  node: WorkflowNode
  ctx: RunContext
  executionId: string
}

export interface NodeExecutor {
  type: string
  structural?: boolean
  execute(ctx: NodeExecuteContext): Promise<unknown>
  onAfter?(ctx: NodeExecuteContext, output: unknown): Promise<void>
}

export class NodeExecutorRegistry {
  private map = new Map<string, NodeExecutor>()

  register(ex: NodeExecutor): void {
    this.map.set(ex.type, ex)
  }

  get(type: string): NodeExecutor | undefined {
    return this.map.get(type)
  }

  has(type: string): boolean {
    return this.map.has(type)
  }

  isStructural(type: string): boolean {
    return this.map.get(type)?.structural ?? false
  }

  listTypes(): string[] {
    return [...this.map.keys()]
  }
}

export const nodeRegistry = new NodeExecutorRegistry()
