import { Field, type NodeConfigProps } from './types'

export default function LogicLoopConfig({ node, onChange, onFocusField }: NodeConfigProps) {
  return (
    <>
      <Field label="列表数据" value={String(node.config.items ?? '[]')} onChange={(v) => onChange('items', v)} multiline onPickVar={() => onFocusField('items')} />
      <Field label="变量名" value={String(node.config.itemVar ?? 'item')} onChange={(v) => onChange('itemVar', v)} />
      <Field label="最大次数" value={String(node.config.maxIterations ?? 20)} onChange={(v) => onChange('maxIterations', Number(v) || 20)} />
    </>
  )
}
