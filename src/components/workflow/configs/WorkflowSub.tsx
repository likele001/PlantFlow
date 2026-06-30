import type { NodeConfigProps } from './types'

export default function WorkflowSubConfig({ node, workflows = [], onChange }: NodeConfigProps) {
  return (
    <label className="block text-xs text-zinc-500">
      目标工作流
      <select
        value={String(node.config.targetWorkflowId ?? '')}
        onChange={(e) => onChange('targetWorkflowId', e.target.value)}
        className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <option value="">请选择</option>
        {workflows.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>
    </label>
  )
}
