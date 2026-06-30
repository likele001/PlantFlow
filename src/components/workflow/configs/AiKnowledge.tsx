import { Field, type NodeConfigProps } from './types'

export default function AiKnowledgeConfig({ node, kbases, onChange, onFocusField }: NodeConfigProps) {
  return (
    <>
      <label className="block text-xs text-zinc-500">
        知识库
        <select
          value={String(node.config.kbaseId ?? '')}
          onChange={(e) => onChange('kbaseId', e.target.value)}
          className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <option value="">请选择</option>
          {kbases.map((k) => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
        </select>
      </label>
      <Field label="检索词" value={String(node.config.query ?? '')} onChange={(v) => onChange('query', v)} onPickVar={() => onFocusField('query')} />
      <Field label="Top K" value={String(node.config.topK ?? 5)} onChange={(v) => onChange('topK', Number(v) || 5)} />
    </>
  )
}
