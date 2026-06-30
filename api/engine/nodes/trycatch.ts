import type { NodeExecutor } from './registry.js'

export const logicTry: NodeExecutor = {
  type: 'logic.try',
  structural: true,
  async execute() {
    return { mode: 'try' }
  },
}

export const logicCatch: NodeExecutor = {
  type: 'logic.catch',
  structural: true,
  async execute({ ctx }) {
    const lastError = String(ctx.vars.__try_error ?? '')
    return { error: lastError, caught: true }
  },
}
