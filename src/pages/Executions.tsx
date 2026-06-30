import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Activity, ChevronRight, RotateCcw } from 'lucide-react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

type Execution = {
  id: string
  workflowId: string
  workflowName?: string
  status: 'running' | 'success' | 'failed' | 'cancelled'
  triggerType: string
  error?: string | null
  startedAt: string
  finishedAt?: string | null
}

type ExecutionStep = {
  id: string
  nodeLabel: string
  nodeType: string
  status: string
  output?: unknown
  error?: string | null
  startedAt: string
}

type ExecutionDetail = Execution & { steps: ExecutionStep[] }

const statusLabel: Record<string, string> = {
  running: '运行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
}

export default function Executions() {
  const { token } = useAuthStore()
  const [params] = useSearchParams()
  const highlight = params.get('highlight')
  const [items, setItems] = useState<Execution[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ExecutionDetail | null>(null)
  const [filter, setFilter] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function loadList() {
    if (!token) return
    const q = filter ? `?status=${encodeURIComponent(filter)}` : ''
    const res = await apiRequest<Execution[]>(`/api/executions${q}`, { token })
    if ('data' in res) {
      setItems(res.data)
      if (highlight && res.data.some((e) => e.id === highlight)) {
        setActiveId(highlight)
      } else if (!activeId && res.data[0]) {
        setActiveId(res.data[0].id)
      }
    }
  }

  useEffect(() => {
    void loadList()
  }, [token, filter])

  useEffect(() => {
    async function loadDetail() {
      if (!token || !activeId) {
        setDetail(null)
        return
      }
      const res = await apiRequest<ExecutionDetail>(`/api/executions/${activeId}`, { token })
      if ('data' in res) setDetail(res.data)
    }
    void loadDetail()
  }, [token, activeId])

  async function retry(id: string) {
    if (!token) return
    setBusy(true)
    setErr(null)
    const res = await apiRequest<{ executionId: string }>(`/api/executions/${id}/retry`, {
      method: 'POST',
      token,
    })
    setBusy(false)
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    await loadList()
    setActiveId(res.data.executionId)
  }

  const active = useMemo(() => items.find((e) => e.id === activeId) ?? null, [activeId, items])

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">执行中心</div>
          <div className="mt-2 text-2xl font-semibold">运行记录与追踪</div>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
          <option value="running">运行中</option>
        </select>
      </div>

      {err ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-700">{err}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b px-5 py-4 text-sm font-semibold">执行记录</div>
          <div className="divide-y dark:divide-zinc-800">
            {items.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setActiveId(e.id)}
                className={cn(
                  'flex w-full items-center gap-3 px-5 py-4 text-left transition',
                  activeId === e.id ? 'bg-zinc-50 dark:bg-zinc-900/50' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/30',
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{e.workflowName ?? e.workflowId}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                    <StatusBadge status={e.status} />
                    <span>{new Date(e.startedAt).toLocaleString()}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              </button>
            ))}
            {!items.length ? (
              <div className="px-5 py-16 text-center text-sm text-zinc-500">暂无执行记录，请在工作流编辑器中「运行一次」</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          {active && detail ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">{detail.workflowName}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                    <StatusBadge status={detail.status} />
                    <span>触发：{detail.triggerType}</span>
                  </div>
                  {detail.error ? (
                    <div className="mt-2 text-sm text-red-600">{detail.error}</div>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {detail.status === 'failed' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void retry(detail.id)}
                      className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-sm font-semibold disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      重试
                    </button>
                  ) : null}
                  <Link
                    to={`/workflows/${detail.workflowId}/editor`}
                    className="inline-flex h-9 items-center rounded-xl border px-3 text-sm font-semibold"
                  >
                    打开工作流
                  </Link>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="text-sm font-semibold">节点追踪</div>
                {detail.steps.map((s) => (
                  <div key={s.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">{s.nodeLabel}</div>
                        <div className="text-xs text-zinc-500">{s.nodeType}</div>
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                    {s.error ? <div className="mt-2 text-sm text-red-600">{s.error}</div> : null}
                    {s.output != null ? (
                      <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-zinc-50 p-2 text-xs dark:bg-zinc-900">
                        {JSON.stringify(s.output, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="py-20 text-center text-sm text-zinc-500">选择左侧执行记录查看详情</div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'success'
      ? 'bg-emerald-500/10 text-emerald-700'
      : status === 'failed'
        ? 'bg-red-500/10 text-red-700'
        : status === 'running'
          ? 'bg-blue-500/10 text-blue-700'
          : 'bg-zinc-500/10 text-zinc-600'
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>
      {statusLabel[status] ?? status}
    </span>
  )
}
