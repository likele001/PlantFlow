import { Field, type NodeConfigProps } from './types'

export default function LogicIfConfig({ node, onChange, onFocusField }: NodeConfigProps) {
  return (
    <>
      <Field label="左值" value={String(node.config.left ?? '')} onChange={(v) => onChange('left', v)} onPickVar={() => onFocusField('left')} />
      <label className="block text-xs text-zinc-500">
        运算符
        <select
          value={String(node.config.operator ?? 'contains')}
          onChange={(e) => onChange('operator', e.target.value)}
          className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <option value="contains">包含</option>
          <option value="not_contains">不包含</option>
          <option value="equals">等于</option>
          <option value="not_equals">不等于</option>
          <option value="not_empty">非空</option>
          <option value="empty">为空</option>
          <option value="gt">大于</option>
          <option value="lt">小于</option>
        </select>
      </label>
      <Field label="右值" value={String(node.config.right ?? '')} onChange={(v) => onChange('right', v)} onPickVar={() => onFocusField('right')} />
    </>
  )
}
