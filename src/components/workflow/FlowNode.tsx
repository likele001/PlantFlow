import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { Bot, GitBranch, Globe, MessageSquare, Play, Zap } from 'lucide-react'

export type FlowNodeData = {
  label: string
  nodeType: string
  color: string
  branch?: boolean
  switchCases?: { id: string; match: string }[]
  loop?: boolean
}

function NodeIcon({ type }: { type: string }) {
  if (type.startsWith('trigger.')) return <Play className="h-3.5 w-3.5" />
  if (type.startsWith('ai.')) return <Bot className="h-3.5 w-3.5" />
  if (type.startsWith('logic.') || type === 'workflow.sub') return <GitBranch className="h-3.5 w-3.5" />
  if (type === 'http.request') return <Globe className="h-3.5 w-3.5" />
  if (type === 'channel.send') return <MessageSquare className="h-3.5 w-3.5" />
  return <Zap className="h-3.5 w-3.5" />
}

export default function FlowNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData
  const isIf = d.nodeType === 'logic.if'
  const isSwitch = d.nodeType === 'logic.switch'
  const isLoop = d.nodeType === 'logic.loop' || d.loop
  const isParallel = d.nodeType === 'logic.parallel'
  const isMerge = d.nodeType === 'logic.merge'

  return (
    <div
      className={cn(
        'min-w-[180px] max-w-[220px] rounded-xl border-2 bg-white shadow-md dark:bg-zinc-950',
        selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-zinc-200 dark:border-zinc-700',
      )}
      style={{ borderTopColor: d.color, borderTopWidth: 3 }}
    >
      {!isMerge ? (
        <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-zinc-400" />
      ) : null}

      <div className="flex items-center gap-2 px-3 py-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ background: d.color }}
        >
          <NodeIcon type={d.nodeType} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            {d.nodeType.replace('.', ' · ')}
          </div>
          <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{d.label}</div>
        </div>
      </div>

      {isIf ? (
        <>
          <Handle type="source" position={Position.Right} id="true" style={{ top: '38%' }} className="!h-3 !w-3 !bg-emerald-500" />
          <Handle type="source" position={Position.Right} id="false" style={{ top: '72%' }} className="!h-3 !w-3 !bg-rose-400" />
          <div className="flex justify-end gap-8 border-t px-3 py-1 text-[10px] text-zinc-500 dark:border-zinc-800">
            <span className="text-emerald-600">是</span>
            <span className="text-rose-500">否</span>
          </div>
        </>
      ) : null}

      {isSwitch ? (
        <>
          {(d.switchCases ?? []).map((c, i) => (
            <Handle
              key={c.id}
              type="source"
              position={Position.Right}
              id={c.id}
              style={{ top: `${30 + i * 16}%` }}
              className="!h-2.5 !w-2.5 !bg-orange-400"
            />
          ))}
          <Handle type="source" position={Position.Right} id="default" style={{ top: '90%' }} className="!h-2.5 !w-2.5 !bg-zinc-400" />
          <div className="border-t px-3 py-1 text-right text-[9px] leading-relaxed text-zinc-500 dark:border-zinc-800">
            {(d.switchCases ?? []).map((c) => (
              <div key={c.id}>{c.match}</div>
            ))}
            <div>默认</div>
          </div>
        </>
      ) : null}

      {isLoop ? (
        <>
          <Handle type="source" position={Position.Right} id="each" style={{ top: '40%' }} className="!h-3 !w-3 !bg-blue-500" />
          <Handle type="source" position={Position.Right} id="done" style={{ top: '72%' }} className="!h-3 !w-3 !bg-emerald-500" />
          <div className="flex justify-end gap-6 border-t px-3 py-1 text-[10px] text-zinc-500 dark:border-zinc-800">
            <span>循环体</span>
            <span>完成</span>
          </div>
        </>
      ) : null}

      {isParallel ? (
        <>
          <Handle type="source" position={Position.Right} id="branch_0" style={{ top: '38%' }} className="!h-3 !w-3 !bg-sky-500" />
          <Handle type="source" position={Position.Right} id="branch_1" style={{ top: '68%' }} className="!h-3 !w-3 !bg-sky-400" />
          <div className="flex justify-end gap-6 border-t px-3 py-1 text-[10px] text-zinc-500 dark:border-zinc-800">
            <span>支路1</span>
            <span>支路2</span>
          </div>
        </>
      ) : null}

      {isMerge ? (
        <>
          <Handle type="target" position={Position.Left} id="in_0" style={{ top: '38%' }} className="!h-3 !w-3 !bg-cyan-500" />
          <Handle type="target" position={Position.Left} id="in_1" style={{ top: '68%' }} className="!h-3 !w-3 !bg-cyan-400" />
          <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-zinc-400" />
          <div className="border-t px-3 py-1 text-center text-[10px] text-cyan-700 dark:border-zinc-800">汇合</div>
        </>
      ) : null}

      {!isIf && !isSwitch && !isLoop && !isParallel && !isMerge ? (
        <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-zinc-400" />
      ) : null}
    </div>
  )
}
