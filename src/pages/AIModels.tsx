import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, Loader2, Pencil, Plus, Star, StarOff, TestTube2, Trash2, XCircle } from 'lucide-react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

type Provider = {
  id: string
  name: string
  baseUrl: string
  apiKeyMasked: string
  defaultChatModel: string
  defaultEmbeddingModel: string | null
  isDefault: boolean
  isDefaultEmbedding: boolean
  createdAt: string
  updatedAt: string
}

type TestResult = {
  ok: true
  httpStatus: number
  latencyMs: number
  modelCount: number
}

/**
 * Pre-filled templates for popular OpenAI-compatible providers.
 * Click a card in the create modal to fill name / baseUrl / default models.
 * The user only needs to type the API Key.
 */
type Preset = {
  key: string
  name: string
  baseUrl: string
  defaultChatModel: string
  defaultEmbeddingModel: string
  tag: '海外' | '国内' | '本地'
  hint?: string
}

const LLM_PRESETS: Preset[] = [
  {
    key: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultChatModel: 'gpt-4o-mini',
    defaultEmbeddingModel: 'text-embedding-3-small',
    tag: '海外',
  },
  {
    key: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultChatModel: 'deepseek-chat',
    defaultEmbeddingModel: '',
    tag: '国内',
  },
  {
    key: 'moonshot',
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultChatModel: 'moonshot-v1-8k',
    defaultEmbeddingModel: '',
    tag: '国内',
  },
  {
    key: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultChatModel: 'glm-4-flash',
    defaultEmbeddingModel: 'embedding-2',
    tag: '国内',
  },
  {
    key: 'qwen',
    name: '通义千问 (DashScope)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultChatModel: 'qwen-plus',
    defaultEmbeddingModel: 'text-embedding-v3',
    tag: '国内',
  },
  {
    key: 'doubao',
    name: '字节豆包 (方舟 Ark)',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultChatModel: 'doubao-1-5-pro-32k-250115',
    defaultEmbeddingModel: '',
    tag: '国内',
    hint: '模型名 = 端点 ID (ep-xxx),去方舟控制台创建',
  },
  {
    key: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    defaultChatModel: 'MiniMax-Text-01',
    defaultEmbeddingModel: 'embo-01',
    tag: '海外',
  },
  {
    key: 'xiaomi',
    name: '小米 MiMo',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    defaultChatModel: 'mimo-7b',
    defaultEmbeddingModel: '',
    tag: '国内',
    hint: 'Base URL 以小米开放平台实际公布为准',
  },
  {
    key: 'ollama',
    name: 'Ollama (本地)',
    baseUrl: 'http://host.docker.internal:11434/v1',
    defaultChatModel: 'llama3.1',
    defaultEmbeddingModel: 'nomic-embed-text',
    tag: '本地',
    hint: '需 ollama serve；向量检索先执行 ollama pull nomic-embed-text',
  },
]

function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  hint?: string
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline gap-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span>{props.label}</span>
        {props.required && <span className="text-red-500">*</span>}
      </div>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        type={props.type ?? 'text'}
        className={cn(
          'h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition',
          'focus:border-zinc-400 focus:ring-4 focus:ring-zinc-400/10 dark:border-zinc-800 dark:bg-zinc-950',
          'dark:focus:border-zinc-600 dark:focus:ring-zinc-600/10',
        )}
      />
      {props.hint && <div className="mt-1 text-[11px] text-zinc-400">{props.hint}</div>}
    </label>
  )
}

function Modal(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 sm:items-center sm:py-10"
      onClick={props.onClose}
    >
      <div
        className="flex w-full max-w-2xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div className="text-lg font-semibold">{props.title}</div>
          <button
            onClick={props.onClose}
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-6 py-4">
          {props.children}
        </div>
      </div>
    </div>
  )
}

export default function AIModels() {
  const { token } = useAuthStore()
  const [list, setList] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Provider | null>(null)
  const [creating, setCreating] = useState(false)
  const [testing, setTesting] = useState<Record<string, 'idle' | 'running' | 'ok' | 'fail'>>({})
  const [testInfo, setTestInfo] = useState<Record<string, string>>({})

  async function refresh() {
    setLoading(true)
    const r = await apiRequest<Provider[]>('/api/ai/providers', { token })
    if (r.success) setList(r.data)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function setDefault(p: Provider) {
    const r = await apiRequest<Provider>(`/api/ai/providers/${p.id}/default`, { method: 'POST', token })
    if (r.success) refresh()
    else alert(r.error)
  }

  async function setDefaultEmbedding(p: Provider) {
    const r = await apiRequest(`/api/ai/providers/${p.id}/default-embedding`, { method: 'POST', token })
    if (r.success) refresh()
    else alert(r.error)
  }

  async function remove(p: Provider) {
    if (!confirm(`确认删除「${p.name}」？`)) return
    const r = await apiRequest(`/api/ai/providers/${p.id}`, { method: 'DELETE', token })
    if (r.success) refresh()
    else alert(r.error)
  }

  async function test(p: Provider) {
    setTesting((s) => ({ ...s, [p.id]: 'running' }))
    setTestInfo((s) => ({ ...s, [p.id]: '' }))
    const r = await apiRequest<TestResult>(`/api/ai/providers/${p.id}/test`, { method: 'POST', token })
    if (r.success) {
      setTesting((s) => ({ ...s, [p.id]: 'ok' }))
      setTestInfo((s) => ({
        ...s,
        [p.id]: `HTTP ${r.data.httpStatus} · ${r.data.latencyMs}ms · ${r.data.modelCount} 个模型`,
      }))
    } else {
      setTesting((s) => ({ ...s, [p.id]: 'fail' }))
      setTestInfo((s) => ({ ...s, [p.id]: r.error }))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            AI · 模型管理
          </div>
          <div className="mt-2 text-2xl font-semibold">LLM 供应商</div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            配置 OpenAI 兼容的供应商（OpenAI / DeepSeek / Moonshot / 通义千问 / 智谱 / Ollama 等）。
            API Key 在服务端用 AES-256-GCM 加密存储，前端仅展示掩码。
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
        >
          <Plus className="h-4 w-4" /> 新增供应商
        </button>
      </div>

      {loading && list.length === 0 ? (
        <div className="text-sm text-zinc-500">加载中…</div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          还没有配置任何供应商。点击右上角"新增供应商"开始。
        </div>
      ) : (
        <div className="grid gap-3">
          {list.map((p) => {
            const t = testing[p.id] ?? 'idle'
            return (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    {p.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <Star className="h-3 w-3" /> Chat默认
                      </span>
                    )}
                    {p.isDefaultEmbedding && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                        向量默认
                      </span>
                    )}
                  </div>
                  <div className="mt-1 truncate text-xs text-zinc-500">{p.baseUrl}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                    <span className="inline-flex items-center gap-1">
                      <KeyRound className="h-3 w-3" /> {p.apiKeyMasked}
                    </span>
                    <span>chat: {p.defaultChatModel}</span>
                    {p.defaultEmbeddingModel && <span>embed: {p.defaultEmbeddingModel}</span>}
                  </div>
                  {testInfo[p.id] && (
                    <div
                      className={cn(
                        'mt-2 text-[11px]',
                        t === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                      )}
                    >
                      {testInfo[p.id]}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => test(p)}
                    disabled={t === 'running'}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    {t === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : t === 'ok' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : t === 'fail' ? (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <TestTube2 className="h-3.5 w-3.5" />
                    )}
                    测试
                  </button>
                  <button
                    onClick={() => setEditing(p)}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <Pencil className="h-3.5 w-3.5" /> 编辑
                  </button>
                  {!p.isDefault && (
                    <button
                      onClick={() => setDefault(p)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                    >
                      <StarOff className="h-3.5 w-3.5" /> Chat默认
                    </button>
                  )}
                  {p.defaultEmbeddingModel && !p.isDefaultEmbedding && (
                    <button
                      onClick={() => setDefaultEmbedding(p)}
                      className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs text-violet-600 hover:bg-violet-50 dark:border-violet-900/50 dark:hover:bg-violet-950/30"
                    >
                      向量默认
                    </button>
                  )}
                  <button
                    onClick={() => remove(p)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {creating && (
        <ProviderForm
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            refresh()
          }}
        />
      )}
      {editing && (
        <ProviderForm
          mode="edit"
          provider={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function ProviderForm(props: {
  mode: 'create' | 'edit'
  provider?: Provider
  onClose: () => void
  onSaved: () => void
}) {
  const { token } = useAuthStore()
  const [name, setName] = useState(props.provider?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(props.provider?.baseUrl ?? 'https://api.openai.com/v1')
  const [apiKey, setApiKey] = useState('')
  const [chatModel, setChatModel] = useState(props.provider?.defaultChatModel ?? 'gpt-4o-mini')
  const [embedModel, setEmbedModel] = useState(props.provider?.defaultEmbeddingModel ?? '')
  const [isDefault, setIsDefault] = useState(props.provider?.isDefault ?? false)
  const [isDefaultEmbedding, setIsDefaultEmbedding] = useState(props.provider?.isDefaultEmbedding ?? false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setErr('')
    setSaving(true)
    if (props.mode === 'create') {
      const r = await apiRequest('/api/ai/providers', {
        method: 'POST',
        token,
        body: {
          name,
          baseUrl,
          apiKey,
          defaultChatModel: chatModel,
          defaultEmbeddingModel: embedModel || null,
          isDefault,
          isDefaultEmbedding,
        },
      })
      setSaving(false)
      if (r.success) props.onSaved()
      else setErr(r.error)
    } else {
      const body: Record<string, unknown> = {
        name,
        baseUrl,
        defaultChatModel: chatModel,
        defaultEmbeddingModel: embedModel || null,
      }
      if (apiKey) body.apiKey = apiKey
      body.isDefaultEmbedding = isDefaultEmbedding
      const r = await apiRequest(`/api/ai/providers/${props.provider!.id}`, {
        method: 'PATCH',
        token,
        body,
      })
      setSaving(false)
      if (r.success) {
        if (isDefault && !props.provider!.isDefault) {
          await apiRequest(`/api/ai/providers/${props.provider!.id}/default`, { method: 'POST', token })
        }
        props.onSaved()
      } else setErr(r.error)
    }
  }

  return (
    <Modal title={props.mode === 'create' ? '新增供应商' : `编辑「${props.provider?.name}」`} onClose={props.onClose}>
      <div className="space-y-3">
        {props.mode === 'create' && (
          <div>
            <div className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              快速选择（点击自动填好名称 / 地址 / 默认模型，只填 Key 即可）
            </div>
            <div className="grid grid-cols-3 gap-2">
              {LLM_PRESETS.map((p) => {
                const active = name === p.name && baseUrl === p.baseUrl
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      setName(p.name)
                      setBaseUrl(p.baseUrl)
                      setChatModel(p.defaultChatModel)
                      setEmbedModel(p.defaultEmbeddingModel)
                    }}
                    className={cn(
                      'group flex flex-col items-start rounded-xl border px-3 py-2 text-left transition',
                      active
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                        : 'border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600 dark:hover:bg-zinc-900',
                    )}
                    title={p.hint}
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <div className="truncate text-xs font-semibold">{p.name}</div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                          active
                            ? 'bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900'
                            : p.tag === '海外'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                              : p.tag === '国内'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                        )}
                      >
                        {p.tag}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'mt-0.5 w-full truncate font-mono text-[10px]',
                        active ? 'opacity-80' : 'text-zinc-500 dark:text-zinc-400',
                      )}
                    >
                      {p.defaultChatModel}
                    </div>
                  </button>
                )
              })}
            </div>
            {(() => {
              const cur = LLM_PRESETS.find((p) => p.name === name && p.baseUrl === baseUrl)
              return cur?.hint ? (
                <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                  {cur.hint}
                </div>
              ) : null
            })()}
            <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800" />
          </div>
        )}
        <Field label="名称" value={name} onChange={setName} placeholder="如：DeepSeek / OpenAI / 通义千问" required />
        <Field
          label="Base URL"
          value={baseUrl}
          onChange={setBaseUrl}
          placeholder="https://api.openai.com/v1"
          required
          hint="支持 OpenAI 兼容接口的服务；以 http(s):// 开头，不要带末尾 /"
        />
        <Field
          label={props.mode === 'edit' ? 'API Key（留空则不修改）' : 'API Key'}
          value={apiKey}
          onChange={setApiKey}
          type="password"
          placeholder="sk-..."
          required={props.mode === 'create'}
          hint="服务端使用 AES-256-GCM 加密后存到数据库，前端只显示掩码"
        />
        <Field label="默认 Chat 模型" value={chatModel} onChange={setChatModel} required />
        <Field
          label="默认 Embedding 模型（可选）"
          value={embedModel}
          onChange={setEmbedModel}
          placeholder="如 text-embedding-3-small"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          设为 Chat 默认供应商
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefaultEmbedding} onChange={(e) => setIsDefaultEmbedding(e.target.checked)} />
          设为 Embedding 默认供应商（向量化/检索专用）
        </label>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={props.onClose}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </Modal>
  )
}
