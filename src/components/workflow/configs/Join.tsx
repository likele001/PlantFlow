import { Field, type NodeConfigProps } from './types'

export default function JoinConfig({ node, onChange, onFocusField }: NodeConfigProps) {
  return (
    <>
      <Field label="数组数据" value={String(node.config.items ?? '')} onChange={(v) => onChange('items', v)} multiline onPickVar={() => onFocusField('items')} />
      <Field label="连接符" value={String(node.config.separator ?? '\n')} onChange={(v) => onChange('separator', v)} />
    </>
  )
}
