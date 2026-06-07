import type { WorkflowNode } from '@/lib/workflow-nodes'

const BASE_VARS = [
  { label: '触发内容', value: '{{trigger.content}}' },
  { label: '触发渠道', value: '{{trigger.channel}}' },
  { label: '上一步文本', value: '{{steps.__last__.text}}' },
  { label: '循环项', value: '{{vars.item}}' },
]

export default function VariablePicker(props: {
  nodes: WorkflowNode[]
  currentNodeId?: string
  onInsert: (expr: string) => void
}) {
  const stepVars = props.nodes
    .filter((n) => n.id !== props.currentNodeId && !n.type.startsWith('trigger.'))
    .slice(-6)
    .map((n) => ({
      label: `${n.label} · text`,
      value: `{{steps.${n.id}.text}}`,
    }))

  const items = [...BASE_VARS, ...stepVars]

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((v) => (
        <button
          key={v.value}
          type="button"
          title={v.value}
          onClick={() => props.onInsert(v.value)}
          className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}
