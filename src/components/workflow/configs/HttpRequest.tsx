import { Field, type NodeConfigProps } from './types'

export default function HttpRequestConfig({ node, connectors = [], onChange, onFocusField }: NodeConfigProps) {
  return (
    <>
      <label className="block text-xs text-zinc-500">
        连接器
        <select
          value={String(node.config.connectorId ?? '')}
          onChange={(e) => onChange('connectorId', e.target.value)}
          className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <option value="">不使用</option>
          {connectors.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <Field label="URL" value={String(node.config.url ?? '')} onChange={(v) => onChange('url', v)} onPickVar={() => onFocusField('url')} />
      <Field label="Method" value={String(node.config.method ?? 'GET')} onChange={(v) => onChange('method', v)} />
      <Field label="Body" value={String(node.config.body ?? '')} onChange={(v) => onChange('body', v)} multiline onPickVar={() => onFocusField('body')} />
    </>
  )
}
