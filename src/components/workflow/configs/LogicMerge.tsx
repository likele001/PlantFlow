import type { NodeConfigProps } from './types'

export default function LogicMergeConfig({ node, onChange }: NodeConfigProps) {
  return (
    <label className="block text-xs text-zinc-500">
      汇合模式
      <select
        value={String(node.config.mode ?? 'all')}
        onChange={(e) => onChange('mode', e.target.value)}
        className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <option value="all">等待全部分支</option>
        <option value="any">任一分支完成</option>
      </select>
    </label>
  )
}
