import { useEffect, useState } from 'react'
import { Bot, Copy, Plus, Trash2 } from 'lucide-react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'

type ChatApp = {
  id: string
  name: string
  description?: string | null
  workflowId: string
  workflowName?: string
  apiKey: string
  status: 'draft' | 'published'
  config: { welcome?: string }
}

type Workflow = { id: string; name: string }

export default function Apps() {
  const { token } = useAuthStore()
  const [apps, setApps] = useState<ChatApp[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [name, setName] = useState('')
  const [workflowId, setWorkflowId] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function load() {
    if (!token) return
    const [aRes, wRes] = await Promise.all([
      apiRequest<ChatApp[]>('/api/apps', { token }),
      apiRequest<Workflow[]>('/api/workflows', { token }),
    ])
    if ('data' in aRes) setApps(aRes.data)
    if ('data' in wRes) setWorkflows(wRes.data)
  }

  useEffect(() => {
    void load()
  }, [token])

  async function create() {
    if (!token || !name.trim() || !workflowId) return
    const res = await apiRequest<ChatApp>('/api/apps', {
      method: 'POST',
      token,
      body: { name: name.trim(), workflowId },
    })
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setName('')
    await load()
  }

  async function publish(id: string) {
    if (!token) return
    await apiRequest(`/api/apps/${id}`, { method: 'PATCH', token, body: { status: 'published' } })
    await load()
  }

  async function remove(id: string) {
    if (!token || !confirm('确定删除？')) return
    await apiRequest(`/api/apps/${id}`, { method: 'DELETE', token })
    await load()
  }

  function copyText(text: string, key: string) {
    void navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">AI 应用</div>
        <div className="mt-2 text-2xl font-semibold">对话应用</div>
        <div className="mt-1 text-sm text-zinc-500">发布工作流为对话 API，类似 Dify 应用。工作流需含「对话触发」或 AI 节点。</div>
      </div>

      {err ? <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-700">{err}</div> : null}

      <div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-sm font-semibold">新建应用</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="应用名称"
            className="h-10 rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          />
          <select
            value={workflowId}
            onChange={(e) => setWorkflowId(e.target.value)}
            className="h-10 rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <option value="">选择工作流</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void create()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950"
          >
            <Plus className="h-4 w-4" /> 创建
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {apps.map((app) => {
          const apiUrl = `${window.location.origin}/api/v1/chat/completions`
          const curl = `curl ${apiUrl} -H "Authorization: Bearer ${app.apiKey}" -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"你好"}]}'`
          return (
            <div key={app.id} className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold">{app.name}</div>
                    <div className="text-xs text-zinc-500">{app.workflowName}</div>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${app.status === 'published' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-zinc-500/10'}`}>
                  {app.status === 'published' ? '已发布' : '草稿'}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-xs">
                <div className="rounded-lg bg-zinc-50 p-2 font-mono break-all dark:bg-zinc-900">{app.apiKey}</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => copyText(app.apiKey, app.id)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1">
                    <Copy className="h-3 w-3" /> {copied === app.id ? '已复制' : '复制 Key'}
                  </button>
                  <button type="button" onClick={() => copyText(curl, `${app.id}-curl`)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1">
                    <Copy className="h-3 w-3" /> {copied === `${app.id}-curl` ? '已复制' : '复制 curl'}
                  </button>
                  {app.status === 'published' ? (
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          `<iframe src="${window.location.origin}/chat/${app.apiKey}" width="400" height="600" frameborder="0"></iframe>`,
                          `${app.id}-embed`,
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"
                    >
                      <Copy className="h-3 w-3" /> {copied === `${app.id}-embed` ? '已复制' : '嵌入代码'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                {app.status !== 'published' ? (
                  <button type="button" onClick={() => void publish(app.id)} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950">
                    发布
                  </button>
                ) : null}
                <button type="button" onClick={() => void remove(app.id)} className="rounded-lg border px-3 py-1.5 text-xs text-red-600">
                  <Trash2 className="inline h-3 w-3" /> 删除
                </button>
              </div>
            </div>
          )
        })}
        {!apps.length ? (
          <div className="col-span-full rounded-2xl border border-dashed py-16 text-center text-sm text-zinc-500">
            暂无对话应用
          </div>
        ) : null}
      </div>
    </div>
  )
}
