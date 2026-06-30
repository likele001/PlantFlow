import { Field, type NodeConfigProps } from './types'

export default function AiChatConfig({ node, onChange, onFocusField }: NodeConfigProps) {
  return (
    <>
      <Field label="系统提示" value={String(node.config.systemPrompt ?? '')} onChange={(v) => onChange('systemPrompt', v)} multiline onPickVar={() => onFocusField('systemPrompt')} />
      <Field label="用户提示" value={String(node.config.userPrompt ?? '')} onChange={(v) => onChange('userPrompt', v)} multiline onPickVar={() => onFocusField('userPrompt')} />
    </>
  )
}
