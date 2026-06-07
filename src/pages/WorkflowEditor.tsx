import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronLeft, History, LayoutGrid, Play, Plus, Save, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'
import FlowNode from '@/components/workflow/FlowNode'
import NodeConfigPanel from '@/components/workflow/NodeConfigPanel'
import {
  NODE_PALETTE,
  defaultNodeConfig,
  type WorkflowDefinition,
  type WorkflowNode,
} from '@/lib/workflow-nodes'
import { WORKFLOW_TEMPLATES } from '@/lib/workflow-templates'
import { autoLayout } from '@/lib/workflow-layout'

const DRAG_TYPE = 'application/workflow-node'

type Workflow = {
  id: string
  name: string
  status: 'draft' | 'published' | 'archived'
  definition?: WorkflowDefinition
}

type Kbase = { id: string; name: string }

const nodeTypes = { flow: FlowNode }

function nodeMeta(type: string, palette: typeof NODE_PALETTE) {
  return palette.find((p) => p.type === type) ?? NODE_PALETTE.find((p) => p.type === type)
}

function toFlowNodes(nodes: WorkflowNode[], palette: typeof NODE_PALETTE = NODE_PALETTE): Node[] {
  return nodes.map((n, i) => {
    const meta = nodeMeta(n.type, palette)
    const cases = (n.config?.cases ?? []) as { match: string; id: string }[]
    return {
      id: n.id,
      type: 'flow',
      position: n.position ?? { x: 80 + (i % 3) * 220, y: 60 + Math.floor(i / 3) * 120 },
      data: {
        label: n.label,
        nodeType: n.type,
        color: meta?.color ?? '#71717a',
        branch: meta?.outputs === 'branch',
        switchCases: n.type === 'logic.switch' ? cases : undefined,
        loop: n.type === 'logic.loop',
      },
    }
  })
}

function toFlowEdges(edges: WorkflowDefinition['edges']): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    animated: true,
  }))
}

function fromFlow(defNodes: WorkflowNode[], rfNodes: Node[], rfEdges: Edge[]): WorkflowDefinition {
  const posMap = new Map(rfNodes.map((n) => [n.id, n.position]))
  const nodes = defNodes.map((n) => ({
    ...n,
    position: posMap.get(n.id) ?? n.position,
  }))
  const edges = rfEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
  }))
  return { nodes, edges }
}

export default function WorkflowEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { token, tenant } = useAuthStore()
  const [item, setItem] = useState<Workflow | null>(null)
  const [defNodes, setDefNodes] = useState<WorkflowNode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [kbases, setKbases] = useState<Kbase[]>([])
  const [connectors, setConnectors] = useState<{ id: string; name: string }[]>([])
  const [workflows, setWorkflows] = useState<{ id: string; name: string }[]>([])
  const [palette, setPalette] = useState(NODE_PALETTE)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [versions, setVersions] = useState<{ id: string; version: number; createdAt: string; note?: string }[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [paletteQ, setPaletteQ] = useState('')
  const rfRef = useRef<ReactFlowInstance | null>(null)

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([])

  const selected = useMemo(() => defNodes.find((n) => n.id === selectedId) ?? null, [defNodes, selectedId])

  const load = useCallback(async () => {
    if (!token || !id) return
    const [wfRes, kbRes, verRes, connRes, wfListRes, palRes] = await Promise.all([
      apiRequest<Workflow>(`/api/workflows/${id}`, { token }),
      apiRequest<Kbase[]>('/api/knowledge/bases', { token }),
      apiRequest<{ id: string; version: number; createdAt: string; note?: string }[]>(`/api/workflows/${id}/versions`, { token }),
      apiRequest<{ id: string; name: string }[]>('/api/connectors', { token }),
      apiRequest<{ id: string; name: string }[]>('/api/workflows', { token }),
      apiRequest<{ type: string; label: string; group: string; color: string; outputs?: number | 'branch' }[]>('/api/engine/nodes', { token }),
    ])
    if (!('data' in wfRes)) {
      setErr(wfRes.error)
      return
    }
    setItem(wfRes.data)
    const nodes = wfRes.data.definition?.nodes ?? []
    const edges = wfRes.data.definition?.edges ?? []
    const pal =
      'data' in palRes && palRes.data.length
        ? (palRes.data as typeof NODE_PALETTE)
        : NODE_PALETTE
    setPalette(pal)
    setDefNodes(nodes)
    setRfNodes(toFlowNodes(nodes, pal))
    setRfEdges(toFlowEdges(edges))
    if ('data' in kbRes) setKbases(kbRes.data)
    if ('data' in verRes) setVersions(verRes.data)
    if ('data' in connRes) setConnectors(connRes.data)
    if ('data' in wfListRes) setWorkflows(wfListRes.data.filter((w) => w.id !== id))
  }, [id, token, setRfNodes, setRfEdges])

  async function rollback(versionId: string) {
    if (!token || !id || !confirm('回滚将用该版本覆盖当前草稿，确定？')) return
    const res = await apiRequest<Workflow>(`/api/workflows/${id}/rollback/${versionId}`, { method: 'POST', token })
    if ('data' in res) {
      setMsg(`已回滚到历史版本`)
      void load()
    } else setErr(res.error)
  }

  useEffect(() => {
    void load()
  }, [load])

  const onConnect = useCallback(
    (conn: Connection) => {
      setRfEdges((eds) =>
        addEdge(
          {
            ...conn,
            id: `e-${conn.source}-${conn.sourceHandle ?? 'o'}-${conn.target}`,
            animated: true,
          },
          eds,
        ),
      )
    },
    [setRfEdges],
  )

  function applyDefinition(definition: WorkflowDefinition) {
    setDefNodes(definition.nodes)
    setRfNodes(toFlowNodes(definition.nodes, palette))
    setRfEdges(toFlowEdges(definition.edges))
    setSelectedId(definition.nodes[0]?.id ?? null)
    setTimeout(() => rfRef.current?.fitView({ padding: 0.2 }), 100)
  }

  function addNode(type: string, label: string, position?: { x: number; y: number }) {
    const pos =
      position ??
      (rfRef.current
        ? rfRef.current.screenToFlowPosition({
            x: window.innerWidth / 2 - 100,
            y: window.innerHeight / 2 - 80,
          })
        : { x: 120 + defNodes.length * 40, y: 100 + defNodes.length * 30 })
    const n: WorkflowNode = {
      id: crypto.randomUUID(),
      type,
      label,
      config: defaultNodeConfig(type),
      position: pos,
    }
    setDefNodes((prev) => [...prev, n])
    setRfNodes((prev) => [...prev, ...toFlowNodes([n], palette)])
    setSelectedId(n.id)
  }

  function duplicateSelected() {
    if (!selected) return
    const copy: WorkflowNode = {
      ...selected,
      id: crypto.randomUUID(),
      label: `${selected.label} 副本`,
      position: { x: (selected.position?.x ?? 0) + 40, y: (selected.position?.y ?? 0) + 40 },
      config: { ...selected.config },
    }
    setDefNodes((prev) => [...prev, copy])
    setRfNodes((prev) => [...prev, ...toFlowNodes([copy], palette)])
    setSelectedId(copy.id)
  }

  function deleteSelected() {
    if (!selectedId) return
    setDefNodes((prev) => prev.filter((n) => n.id !== selectedId))
    setRfNodes((prev) => prev.filter((n) => n.id !== selectedId))
    setRfEdges((prev) => prev.filter((e) => e.source !== selectedId && e.target !== selectedId))
    setSelectedId(null)
  }

  function onDragStart(e: React.DragEvent, type: string, label: string) {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ type, label }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData(DRAG_TYPE)
      if (!raw || !rfRef.current) return
      try {
        const { type, label } = JSON.parse(raw) as { type: string; label: string }
        const position = rfRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        addNode(type, label, position)
      } catch { /* ignore */ }
    },
    [defNodes.length, palette],
  )

  function updateSelectedConfig(key: string, value: unknown) {
    if (!selectedId) return
    setDefNodes((prev) => {
      const next = prev.map((n) => {
        if (n.id !== selectedId) return n
        if (key === '__label__') return { ...n, label: String(value) }
        return { ...n, config: { ...n.config, [key]: value } }
      })
      const updated = next.find((n) => n.id === selectedId)
      if (updated) {
        const cases = (updated.config.cases ?? []) as { match: string; id: string }[]
        setRfNodes((prevRf) =>
          prevRf.map((rn) =>
            rn.id === selectedId
              ? {
                  ...rn,
                  data: {
                    ...rn.data,
                    label: updated.label,
                    switchCases: updated.type === 'logic.switch' ? cases : rn.data?.switchCases,
                  },
                }
              : rn,
          ),
        )
      }
      return next
    })
  }

  async function save() {
    if (!token || !id) return
    setBusy(true)
    setErr(null)
    const definition = fromFlow(defNodes, rfNodes, rfEdges)
    const res = await apiRequest<Workflow>(`/api/workflows/${id}`, {
      method: 'PATCH',
      token,
      body: { definition },
    })
    setBusy(false)
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setDefNodes(definition.nodes)
    setMsg('已保存')
  }

  async function publish() {
    await save()
    if (!token || !id) return
    setBusy(true)
    const res = await apiRequest<Workflow>(`/api/workflows/${id}/publish`, { method: 'POST', token })
    setBusy(false)
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setItem((s) => (s ? { ...s, status: 'published' } : s))
    setMsg('已发布，Webhook/Cron 触发器已同步')
  }

  async function runOnce() {
    if (!token || !id) return
    setBusy(true)
    const res = await apiRequest<{ jobId: string }>(`/api/workflows/${id}/run`, {
      method: 'POST',
      token,
      body: { triggerData: { type: 'manual', content: '手动测试', channel: 'manual' } },
    })
    setBusy(false)
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setMsg('已提交执行队列')
    setTimeout(() => navigate('/executions'), 800)
  }

  const groups = useMemo(() => {
    const q = paletteQ.trim().toLowerCase()
    const m = new Map<string, typeof NODE_PALETTE>()
    for (const p of palette) {
      if (q && !p.label.toLowerCase().includes(q) && !p.type.toLowerCase().includes(q)) continue
      if (!m.has(p.group)) m.set(p.group, [])
      m.get(p.group)!.push(p)
    }
    return [...m.entries()]
  }, [palette, paletteQ])

  function layoutGraph() {
    const definition = autoLayout(fromFlow(defNodes, rfNodes, rfEdges))
    applyDefinition(definition)
    setMsg('已自动排列')
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-3">
      <div className="flex flex-shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/workflows"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-white dark:border-zinc-800 dark:bg-zinc-950"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="text-xs text-zinc-500">流程编排</div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              {item?.name ?? '工作流'}
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs',
                  item?.status === 'published' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-zinc-500/10',
                )}
              >
                {item?.status === 'published' ? '已发布' : '草稿'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => layoutGraph()} className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-sm font-semibold" title="自动排列">
            <LayoutGrid className="h-4 w-4" /> 排列
          </button>
          <button type="button" onClick={() => setShowVersions((s) => !s)} className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-sm font-semibold">
            <History className="h-4 w-4" /> 版本
          </button>
          <button type="button" disabled={busy} onClick={() => void save()} className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-sm font-semibold disabled:opacity-50">
            <Save className="h-4 w-4" /> 保存
          </button>
          <button type="button" disabled={busy} onClick={() => void publish()} className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-sm font-semibold disabled:opacity-50">
            发布
          </button>
          <button type="button" disabled={busy} onClick={() => void runOnce()} className="inline-flex h-9 items-center gap-1 rounded-xl bg-zinc-900 px-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950">
            <Play className="h-4 w-4" /> 运行
          </button>
        </div>
      </div>

      {err ? <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-700">{err}</div> : null}
      {msg ? <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-700">{msg}</div> : null}

      {showVersions ? (
        <div className="rounded-xl border bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-semibold">发布历史</div>
          <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm dark:border-zinc-800">
                <div>
                  <span className="font-semibold">v{v.version}</span>
                  <span className="ml-2 text-xs text-zinc-500">{new Date(v.createdAt).toLocaleString()}</span>
                  {v.note ? <span className="ml-2 text-xs text-zinc-400">{v.note}</span> : null}
                </div>
                <button type="button" onClick={() => void rollback(v.id)} className="text-xs font-semibold text-blue-600">
                  回滚
                </button>
              </div>
            ))}
            {!versions.length ? <div className="text-sm text-zinc-500">发布后将在此保留版本快照</div> : null}
          </div>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[220px_1fr_300px]">
        <div className="flex flex-col overflow-hidden rounded-2xl border bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b p-3 dark:border-zinc-800">
            <div className="text-sm font-semibold">节点库</div>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                value={paletteQ}
                onChange={(e) => setPaletteQ(e.target.value)}
                placeholder="搜索节点…"
                className="h-8 w-full rounded-lg border pl-8 pr-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
              />
            </div>
            <div className="mt-2 text-[10px] text-zinc-400">拖到画布，或点击添加</div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="mb-3 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">模板</div>
              {WORKFLOW_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyDefinition(t.build())}
                  className="w-full rounded-lg border px-2 py-2 text-left text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-[10px] text-zinc-500">{t.description}</div>
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {groups.map(([group, items]) => (
                <div key={group}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{group}</div>
                  <div className="mt-1 space-y-1">
                    {items.map((it) => (
                      <div
                        key={it.type}
                        draggable
                        onDragStart={(e) => onDragStart(e, it.type, it.label)}
                        onClick={() => addNode(it.type, it.label)}
                        className="flex cursor-grab items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs active:cursor-grabbing hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
                        <span className="flex-1 font-medium">{it.label}</span>
                        <Plus className="h-3 w-3 text-zinc-400" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border bg-white dark:border-zinc-800 dark:bg-zinc-950">
          {!defNodes.length ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-8">
              <div className="max-w-sm rounded-2xl border border-dashed bg-white/90 p-6 text-center shadow-sm backdrop-blur dark:bg-zinc-950/90">
                <div className="text-lg font-semibold">从空白开始</div>
                <p className="mt-2 text-sm text-zinc-500">拖拽左侧节点到画布，或选一个模板快速开始</p>
              </div>
            </div>
          ) : null}
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={(inst) => { rfRef.current = inst }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
            connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2 }}
            deleteKeyCode={['Backspace', 'Delete']}
            onNodesDelete={(deleted) => {
              const ids = new Set(deleted.map((n) => n.id))
              setDefNodes((prev) => prev.filter((n) => !ids.has(n.id)))
              if (selectedId && ids.has(selectedId)) setSelectedId(null)
            }}
            onEdgesDelete={(deleted) => {
              const ids = new Set(deleted.map((e) => e.id))
              setRfEdges((prev) => prev.filter((e) => !ids.has(e.id)))
            }}
          >
            <Background gap={20} size={1} variant={BackgroundVariant.Dots} />
            <Controls showInteractive />
            <MiniMap zoomable pannable className="!bg-zinc-100 dark:!bg-zinc-900" />
          </ReactFlow>
        </div>

        <div className="overflow-y-auto rounded-2xl border bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-semibold">节点配置</div>
          <NodeConfigPanel
            node={selected}
            nodes={defNodes}
            kbases={kbases}
            connectors={connectors}
            workflows={workflows}
            tenantId={tenant?.id}
            onChange={updateSelectedConfig}
            onDuplicate={selected ? duplicateSelected : undefined}
            onDelete={selected ? deleteSelected : undefined}
          />
        </div>
      </div>
    </div>
  )
}

export type { WorkflowNode }
