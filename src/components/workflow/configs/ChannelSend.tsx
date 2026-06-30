import { Field, type NodeConfigProps } from './types'

export default function ChannelSendConfig({ node, onChange, onFocusField }: NodeConfigProps) {
  const channel = String(node.config.channel ?? 'wecom')
  return (
    <>
      <label className="block text-xs text-zinc-500">
        渠道
        <select
          value={channel}
          onChange={(e) => onChange('channel', e.target.value)}
          className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <option value="wecom">企业微信</option>
          <option value="feishu">飞书</option>
        </select>
      </label>
      {channel === 'feishu' ? (
        <Field label="飞书群 chat_id" value={String(node.config.receiveId ?? '')} onChange={(v) => onChange('receiveId', v)} placeholder="oc_xxxxxxxx（渠道页测试发送时可获取）" />
      ) : (
        <Field label="接收人 UserId（可选）" value={String(node.config.toUser ?? '')} onChange={(v) => onChange('toUser', v)} placeholder="留空则回复当前会话" />
      )}
      <Field label="内容" value={String(node.config.content ?? '')} onChange={(v) => onChange('content', v)} multiline onPickVar={() => onFocusField('content')} />
    </>
  )
}
