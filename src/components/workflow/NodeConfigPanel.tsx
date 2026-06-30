import { useState } from 'react'
import type { WorkflowNode } from '@/lib/workflow-nodes'
import { getNodeConfigComponent } from '@/lib/node-config-registry'
import { Braces, Copy, Trash2 } from 'lucide-react'
import VariablePicker from './VariablePicker'
import { Field } from './configs/types'

type Kbase = { id: string; name: string }
type Connector = { id: string; name: string }
type Wf = { id: string; name: string }

export default function NodeConfigPanel(props: {
  node: WorkflowNode | null
  nodes: WorkflowNode[]
  kbases: Kbase[]
  connectors?: Connector[]
  workflows?: Wf[]
  tenantId?: string
  onChange: (key: string, value: unknown) => void
  onDuplicate?: () => void
  onDelete?: () => void
}) {
  const { node, nodes, kbases, connectors = [], workflows = [], tenantId, onChange, onDuplicate, onDelete } = props
  const [varTarget, setVarTarget] = useState<string | null>(null)

  if (!node) {
    return (
      <div className="mt-4 space-y-3 text-sm text-zinc-500">
        <p>点击画布中的节点进行配置</p>
        <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-xs leading-relaxed dark:border-zinc-700">
          <div className="font-semibold text-zinc-700 dark:text-zinc-200">快速上手</div>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>从左侧<strong>拖拽</strong>或点击添加节点</li>
            <li>从节点右侧圆点<strong>拖到</strong>下一节点连线</li>
            <li>条件分支：绿=是，红=否</li>
            <li>保存 → 发布 → 运行</li>
          </ol>
        </div>
      </div>
    )
  }

  function insertVar(expr: string) {
    if (!varTarget) return
    onChange(varTarget, String(node!.config[varTarget] ?? '') + expr)
    setVarTarget(null)
  }

  const ConfigComponent = getNodeConfigComponent(node.type)

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-xs text-zinc-400">{node.type}</div>
        <div className="flex gap-1">
          {onDuplicate ? (
            <button type="button" onClick={onDuplicate} className="rounded-lg border p-1.5 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900" title="复制节点">
              <Copy className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" onClick={onDelete} className="rounded-lg border p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="删除节点">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <Field label="节点名称" value={node.label} onChange={(v) => onChange('__label__', v)} />

      <ConfigComponent
        node={node}
        nodes={nodes}
        kbases={kbases}
        connectors={connectors}
        workflows={workflows}
        tenantId={tenantId}
        onChange={onChange}
        onFocusField={setVarTarget}
      />

      <div className="space-y-2 border-t pt-3 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          <Braces className="h-4 w-4" />
          插入变量
          {varTarget ? <span className="text-xs font-normal text-blue-600">点击插入到「{varTarget}」</span> : null}
        </div>
        <VariablePicker nodes={nodes} currentNodeId={node.id} onInsert={insertVar} />
      </div>
    </div>
  )
}

export { Field }
