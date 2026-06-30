import { Field, type NodeConfigProps } from './types'

export default function LogicSetConfig({ node, onChange, onFocusField }: NodeConfigProps) {
  const vars = (node.config.variables ?? {}) as Record<string, string>
  const entries = Object.entries(vars)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>变量</span>
        <button type="button" className="text-blue-600" onClick={() => onChange('variables', { ...vars, [entries.length ? `key${entries.length}` : 'key']: '' })}>
          + 添加
        </button>
      </div>
      {Object.entries(vars).map(([k, v], i) => (
        <div key={i} className="flex gap-1">
          <input
            value={k}
            onChange={(e) => {
              const next = { ...vars }
              delete next[k]
              next[e.target.value] = v
              onChange('variables', next)
            }}
            className="h-9 w-20 shrink-0 rounded-lg border px-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
            placeholder="key"
          />
          <input
            value={String(v)}
            onChange={(e) => {
              const next = { ...vars, [k]: e.target.value }
              onChange('variables', next)
            }}
            className="h-9 flex-1 rounded-lg border px-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
            placeholder="value"
          />
          <button type="button" className="text-xs text-red-500 shrink-0" onClick={() => {
            const next = { ...vars }
            delete next[k]
            onChange('variables', next)
          }}>
            删
          </button>
        </div>
      ))}
    </div>
  )
}
