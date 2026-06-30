import { Field, type NodeConfigProps } from './types'

export default function GenericConfig({ node, onChange, onFocusField }: NodeConfigProps) {
  const cfg = node.config ?? {}
  const entries = Object.entries(cfg).filter(([k]) => k !== '__label__' && !['cases', 'variables', 'headers'].includes(k))

  if (entries.length === 0) {
    return <div className="text-xs text-zinc-400">无配置项</div>
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <Field
          key={key}
          label={key}
          value={typeof val === 'string' ? val : JSON.stringify(val)}
          onChange={(v) => {
            try { onChange(key, JSON.parse(v)) } catch { onChange(key, v) }
          }}
          onPickVar={() => onFocusField(key)}
          multiline={typeof val === 'object' || String(val).length > 60}
        />
      ))}
    </div>
  )
}
