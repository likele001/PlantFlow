import { Field, type NodeConfigProps } from './types'

export default function AiAgentConfig({ node, kbases, onChange, onFocusField }: NodeConfigProps) {
  return (
    <>
      <Field label="系统提示" value={String(node.config.systemPrompt ?? '')} onChange={(v) => onChange('systemPrompt', v)} multiline onPickVar={() => onFocusField('systemPrompt')} />
      <Field label="用户提示" value={String(node.config.userPrompt ?? '')} onChange={(v) => onChange('userPrompt', v)} multiline onPickVar={() => onFocusField('userPrompt')} />
      <Field label="最大步数" value={String(node.config.maxSteps ?? 4)} onChange={(v) => onChange('maxSteps', Number(v) || 4)} />
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
      <label className="flex items-center gap-2 text-xs text-zinc-500">
        <input type="checkbox" checked={node.config.enableHttp !== false} onChange={(e) => onChange('enableHttp', e.target.checked)} />
        启用 HTTP 工具
      </label>
    </>
  )
}
