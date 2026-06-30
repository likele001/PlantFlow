import vm from 'node:vm'
import type { NodeExecutor } from './registry.js'
import { renderTemplate } from '../template.js'

export const logicCode: NodeExecutor = {
  type: 'logic.code',
  async execute({ node, ctx }) {
    const cfg = node.config ?? {}
    const code = renderTemplate(String(cfg.code ?? ''), ctx)
    if (!code.trim()) return { result: undefined }

    const ctxProxy = {
      trigger: ctx.trigger,
      steps: ctx.steps,
      vars: ctx.vars,
      _ctx: ctx,
    }
    try {
      const result = vm.runInNewContext('(function(){' + code + '\n})()', {
        $: ctxProxy,
        console,
        JSON,
        Math,
        Date,
        parseInt,
        parseFloat,
        String,
        Number,
        Boolean,
        Array,
        Object,
        RegExp,
        setTimeout: undefined as unknown,
        setInterval: undefined as unknown,
        fetch: undefined as unknown,
        require: undefined as unknown,
        process: undefined as unknown,
        Buffer: undefined as unknown,
        global: undefined as unknown,
      }, { timeout: Number(cfg.timeout ?? 5000) })
      return { result, type: typeof result }
    } catch (e: unknown) {
      throw new Error(`Code 节点执行失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  },
}
