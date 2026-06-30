import { useEffect, useState } from 'react'
import { Blocks, Cable, Database, Globe, MessageSquare, Plus, Trash2 } from 'lucide-react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'

type Connector = {
  id: string
  name: string
  type: 'http' | 'database' | 'wecom' | 'feishu' | 'custom'
  config: Record<string, unknown>
}

const TYPE_META: Record<Connector['type'], { label: string; icon: React.ReactNode }> = {
  http: { label: 'HTTP', icon: <Globe className="h-4 w-4" /> },
  database: { label: '数据库', icon: <Database className="h-4 w-4" /> },
  wecom: { label: '企业微信', icon: <MessageSquare className="h-4 w-4" /> },
  feishu: { label: '飞书', icon: <MessageSquare className="h-4 w-4" /> },
  custom: { label: '自定义', icon: <Cable className="h-4 w-4" /> },
}

export default function Connectors() {
  const { token } = useAuthStore()
  const [items, setItems] = useState<Connector[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState<Connector['type']>('http')
  const [configJson, setConfigJson] = useState('{\n  "baseUrl": "https://"\n}')
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    if (!token) return
    const res = await apiRequest<Connector[]>('/api/connectors', { token })
    if ('data' in res) setItems(res.data)
  }

  useEffect(() => {
    void load()
  }, [token])

  async function create() {
    if (!token || !name.trim()) return
    let config: Record<string, unknown> = {}
    try {
      config = JSON.parse(configJson)
    } catch {
      setErr('配置 JSON 格式错误')
      return
    }
    const res = await apiRequest<Connector>('/api/connectors', {
      method: 'POST',
      token,
      body: { name: name.trim(), type, config },
    })
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setName('')
    await load()
  }

  async function remove(id: string) {
    if (!token || !confirm('确定删除？')) return
    await apiRequest(`/api/connectors/${id}`, { method: 'DELETE', token })
    await load()
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">连接器</div>
        <div className="mt-2 text-2xl font-semibold">节点与凭据管理</div>
        <div className="mt-1 text-sm text-zinc-500">保存 HTTP、数据库等外部系统连接配置，供工作流节点引用。</div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-700">{err}</div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-sm font-semibold">新建连接器</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="名称"
            className="h-10 rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as Connector['type'])}
            className="h-10 rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            {Object.entries(TYPE_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <textarea
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
          rows={5}
          className="mt-3 w-full rounded-xl border px-3 py-2 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-950"
        />
        <button
          type="button"
          onClick={() => void create()}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950"
        >
          <Plus className="h-4 w-4" />
          创建
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((c) => (
          <div key={c.id} className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold">{c.name}</div>
                <div className="mt-1 text-xs text-zinc-500">{TYPE_META[c.type]?.label ?? c.type}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900">
                  {TYPE_META[c.type]?.icon ?? <Blocks className="h-4 w-4" />}
                </div>
                <button type="button" onClick={() => void remove(c.id)} className="text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-zinc-50 p-2 text-xs dark:bg-zinc-900">
              {JSON.stringify(c.config, null, 2)}
            </pre>
          </div>
        ))}
        {!items.length ? (
          <div className="col-span-full rounded-2xl border border-dashed px-4 py-16 text-center text-sm text-zinc-500">
            暂无连接器，请在上方创建
          </div>
        ) : null}
      </div>
    </div>
  )
}
