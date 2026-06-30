import { Field, type NodeConfigProps } from './types'

export default function DateConfig({ node, onChange, onFocusField }: NodeConfigProps) {
  return (
    <>
      <Field label="值" value={String(node.config.value ?? 'now')} onChange={(v) => onChange('value', v)} placeholder="now | 时间戳 | ISO 日期" onPickVar={() => onFocusField('value')} />
      <Field label="格式" value={String(node.config.format ?? 'YYYY-MM-DD HH:mm:ss')} onChange={(v) => onChange('format', v)} placeholder="YYYY-MM-DD HH:mm:ss" />
      <Field label="偏移天数" value={String(node.config.offsetDays ?? 0)} onChange={(v) => onChange('offsetDays', Number(v) || 0)} />
      <div className="text-xs text-zinc-500">
        格式占位：YYYY MM DD HH mm ss WW(星期)
      </div>
    </>
  )
}
