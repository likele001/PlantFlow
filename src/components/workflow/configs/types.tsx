import type { WorkflowNode } from '@/lib/workflow-nodes'

export type Kbase = { id: string; name: string }
export type Connector = { id: string; name: string }
export type Wf = { id: string; name: string }

export interface NodeConfigProps {
  node: WorkflowNode
  nodes: WorkflowNode[]
  kbases: Kbase[]
  connectors?: Connector[]
  workflows?: Wf[]
  tenantId?: string
  onChange: (key: string, value: unknown) => void
  onFocusField: (key: string | null) => void
}

export function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  placeholder?: string
  onPickVar?: () => void
}) {
  const cls = 'mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950'
  return (
    <label className="block text-xs text-zinc-500">
      <span className="flex items-center justify-between">
        {props.label}
        {props.onPickVar ? (
          <button type="button" onClick={props.onPickVar} className="text-[10px] text-blue-600">
            {'{{ }}'}
          </button>
        ) : null}
      </span>
      {props.multiline ? (
        <textarea value={props.value} onChange={(e) => props.onChange(e.target.value)} rows={3} placeholder={props.placeholder} className={cls} />
      ) : (
        <input value={props.value} onChange={(e) => props.onChange(e.target.value)} placeholder={props.placeholder} className={cls} />
      )}
    </label>
  )
}
