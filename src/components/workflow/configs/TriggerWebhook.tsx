import { Field, type NodeConfigProps } from './types'

export default function TriggerWebhookConfig({ node, tenantId, onChange, onFocusField }: NodeConfigProps) {
  const webhookUrl = tenantId
    ? `${window.location.origin}/api/hooks/${tenantId}/${String(node.config.path ?? '')}`
    : ''
  return (
    <>
      <Field label="路径标识" value={String(node.config.path ?? '')} onChange={(v) => onChange('path', v)} />
      {webhookUrl ? (
        <div className="rounded-xl bg-zinc-50 p-3 text-xs break-all text-zinc-600 dark:bg-zinc-900">
          <div className="font-semibold">Webhook 地址</div>
          <div className="mt-1">{webhookUrl}</div>
        </div>
      ) : null}
    </>
  )
}

export { Field }
