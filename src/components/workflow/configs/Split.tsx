import { Field, type NodeConfigProps } from './types'

export default function SplitConfig({ node, onChange, onFocusField }: NodeConfigProps) {
  return (
    <>
      <Field label="输入" value={String(node.config.input ?? '')} onChange={(v) => onChange('input', v)} onPickVar={() => onFocusField('input')} />
      <Field label="分隔符" value={String(node.config.separator ?? ',')} onChange={(v) => onChange('separator', v)} />
    </>
  )
}
