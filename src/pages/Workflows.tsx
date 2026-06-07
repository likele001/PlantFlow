import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Archive, Plus, Search, Trash2, Workflow as WorkflowIcon } from 'lucide-react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

type Workflow = {
  id: string
  name: string
  status: 'draft' | 'published' | 'archived'
  createdAt: string
  updatedAt: string
}

export default function Workflows() {
  const navigate = useNavigate()
  const { token } = useAuthStore()
  const [items, setItems] = useState<Workflow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function defaultWorkflowName() {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `新工作流 ${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase()
    if (!key) return items
    return items.filter((w) => w.name.toLowerCase().includes(key))
  }, [items, q])

  async function load() {
    if (!token) return
    setIsLoading(true)
    setErr(null)
    const res = await apiRequest<Workflow[]>('/api/workflows', { token })
    if (!('data' in res)) {
      setErr(res.error)
      setIsLoading(false)
      return
    }
    setItems(res.data)
    setIsLoading(false)
  }

  useEffect(() => {
    void load()
  }, [token])

  async function archiveWorkflow(w: Workflow) {
    if (!token) return
    await apiRequest(`/api/workflows/${w.id}`, { method: 'PATCH', token, body: { status: 'archived' } })
    await load()
  }

  async function deleteWorkflow(w: Workflow) {
    if (!token || !confirm(`确定删除「${w.name}」？`)) return
    const res = await apiRequest(`/api/workflows/${w.id}`, { method: 'DELETE', token })
    if (!('data' in res) && 'error' in res) setErr(res.error)
    await load()
  }

  async function createWorkflow() {
    if (!token) {
      setErr('请先登录')
      return
    }
    const n = name.trim() || defaultWorkflowName()
    setErr(null)
    setIsCreating(true)
    const res = await apiRequest<Workflow>('/api/workflows', { method: 'POST', token, body: { name: n } })
    setIsCreating(false)
    if (!res.success) {
      setErr(res.error || '创建失败')
      return
    }
    setName('')
    navigate(`/workflows/${res.data.id}/editor`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">工作流</div>
          <div className="mt-2 text-2xl font-semibold">编排与发布</div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">创建、编排并发布工作流，支持手动运行与渠道消息触发。</div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={cn(
                'h-10 w-72 rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-sm outline-none transition',
                'focus:border-zinc-400 focus:ring-4 focus:ring-zinc-400/10 dark:border-zinc-800 dark:bg-zinc-950',
                'dark:focus:border-zinc-600 dark:focus:ring-zinc-600/10',
              )}
              placeholder="搜索工作流"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createWorkflow()
              }}
              className={cn(
                'h-10 w-56 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition',
                'focus:border-zinc-400 focus:ring-4 focus:ring-zinc-400/10 dark:border-zinc-800 dark:bg-zinc-950',
                'dark:focus:border-zinc-600 dark:focus:ring-zinc-600/10',
              )}
              placeholder="名称（可留空自动命名）"
              disabled={isCreating}
            />
            <button
              type="button"
              onClick={() => void createWorkflow()}
              disabled={isCreating}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-900 px-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            >
              <Plus className="h-4 w-4" />
              {isCreating ? '创建中…' : '新建'}
            </button>
          </div>
        </div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
          {err}
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="text-sm font-semibold">工作流列表</div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {isLoading ? '加载中…' : '刷新'}
          </button>
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {filtered.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                    <WorkflowIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{w.name}</div>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      更新于 {new Date(w.updatedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold',
                    w.status === 'published'
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-200',
                  )}
                >
                  {w.status === 'published' ? '已发布' : w.status === 'archived' ? '已归档' : '草稿'}
                </div>
                <button type="button" onClick={() => void archiveWorkflow(w)} className="rounded-lg border px-2 py-1 text-xs" title="归档">
                  <Archive className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => void deleteWorkflow(w)} className="rounded-lg border px-2 py-1 text-xs text-red-600" title="删除">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <Link
                  to={`/workflows/${w.id}/editor`}
                  className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                >
                  打开编辑器
                </Link>
              </div>
            </div>
          ))}

          {!filtered.length ? (
            <div className="px-5 py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
              暂无工作流
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
