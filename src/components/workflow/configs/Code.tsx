import { Field, type NodeConfigProps } from './types'

export default function CodeConfig({ node, onChange, onFocusField }: NodeConfigProps) {
  return (
    <>
      <Field label="JS 代码" value={String(node.config.code ?? '')} onChange={(v) => onChange('code', v)} multiline onPickVar={() => onFocusField('code')} />
      <Field label="超时(ms)" value={String(node.config.timeout ?? 5000)} onChange={(v) => onChange('timeout', Number(v) || 5000)} />
      <div className="text-xs text-zinc-500 space-y-1">
        <div>可用变量：<code>$.trigger.content</code> <code>$.steps.nodeId.field</code> <code>$.vars.key</code></div>
        <div>最后一行表达式的值将作为节点输出</div>
      </div>
    </>
  )
}
