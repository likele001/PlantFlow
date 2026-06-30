import { Field, type NodeConfigProps } from './types'

export default function LogicDelayConfig({ node, onChange }: NodeConfigProps) {
  return (
    <Field label="延迟(ms)" value={String(node.config.ms ?? 300)} onChange={(v) => onChange('ms', Number(v) || 0)} />
  )
}
