import { Field, type NodeConfigProps } from './types'

export default function TriggerCronConfig({ node, onChange, onFocusField }: NodeConfigProps) {
  return (
    <>
      <Field label="Cron 表达式" value={String(node.config.cron ?? '')} onChange={(v) => onChange('cron', v)} onPickVar={() => onFocusField('cron')} />
      <Field label="时区" value={String(node.config.timezone ?? 'Asia/Shanghai')} onChange={(v) => onChange('timezone', v)} />
      <div className="text-xs text-zinc-500">示例：0 9 * * * = 每天 9:00</div>
    </>
  )
}
