import { Field, type NodeConfigProps } from './types'

export default function JsonParseConfig({ node, onChange, onFocusField }: NodeConfigProps) {
  return (
    <Field label="输入" value={String(node.config.input ?? '')} onChange={(v) => onChange('input', v)} multiline onPickVar={() => onFocusField('input')} />
  )
}
