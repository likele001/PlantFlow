import { useEffect, useState } from 'react'
import { apiRequest } from '../utils/api'

type Credential = {
  id: string
  name: string
  type: string
  maskedPreview: string
  createdAt: string
  updatedAt: string
}

const TYPE_LABELS: Record<string, string> = {
  api_key: 'API Key',
  oauth2: 'OAuth2',
  basic_auth: '基础认证',
  bearer_token: 'Bearer Token',
  custom: '自定义',
}

const TYPE_FIELDS: Record<string, { label: string; key: string; placeholder: string; secret?: boolean }[]> = {
  api_key: [
    { label: 'API Key', key: 'apiKey', placeholder: 'sk-...', secret: true },
  ],
  oauth2: [
    { label: '授权 URL', key: 'authUrl', placeholder: 'https://provider.com/oauth/authorize' },
    { label: '令牌 URL', key: 'tokenUrl', placeholder: 'https://provider.com/oauth/token' },
    { label: 'Client ID', key: 'clientId', placeholder: 'your-client-id' },
    { label: 'Client Secret', key: 'clientSecret', placeholder: 'your-client-secret', secret: true },
    { label: 'Scope (可选)', key: 'scope', placeholder: 'read write' },
  ],
  basic_auth: [
    { label: '用户名', key: 'username', placeholder: 'user@example.com' },
    { label: '密码', key: 'password', placeholder: 'password', secret: true },
  ],
  bearer_token: [
    { label: 'Token', key: 'token', placeholder: 'eyJ...', secret: true },
  ],
  custom: [
    { label: 'Key', key: 'key', placeholder: 'API_KEY' },
    { label: 'Value', key: 'value', placeholder: 'secret', secret: true },
  ],
}

export default function Credentials() {
  const [creds, setCreds] = useState<Credential[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', type: 'api_key', data: {} as Record<string, string> })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchCreds() }, [])

  async function fetchCreds() {
    try {
      const res = await apiRequest<Credential[]>(`/api/credentials`)
      setCreds(res.success ? (res.data ?? []) : [])
    } catch { /* ignore */ }
  }

  function resetForm() {
    setForm({ name: '', type: 'api_key', data: {} })
    setEditId(null)
    setShowCreate(false)
    setError('')
  }

  async function handleSave() {
    setLoading(true)
    setError('')
    try {
      if (editId) {
        await apiRequest(`/api/credentials/${editId}`, { method: 'PATCH', body: { name: form.name, data: form.data } })
      } else {
        await apiRequest('/api/credentials', { method: 'POST', body: form })
      }
      resetForm()
      await fetchCreds()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除该凭证？')) return
    try {
      await apiRequest(`/api/credentials/${id}`, { method: 'DELETE' })
      await fetchCreds()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '删除失败')
    }
  }

  async function handleOAuthAuthorize(cred: Credential) {
    const redirectUri = window.location.origin + '/credentials'
    try {
      const res = await apiRequest<{ url: string }>('/api/credentials/oauth/authorize', {
        method: 'POST',
        body: { credentialId: cred.id, redirectUri },
      })
      if (res.success && res.data?.url) window.open(res.data.url, '_blank')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'OAuth 授权失败')
    }
  }

  const fields = TYPE_FIELDS[form.type] ?? TYPE_FIELDS.custom

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">凭证管理</h1>
          <p className="text-sm text-zinc-500">统一管理 API Key、OAuth2 等外部服务凭据，存储加密</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowCreate(true) }}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          添加凭证
        </button>
      </div>

      {error ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30">{error}</div>
      ) : null}

      {showCreate || editId ? (
        <div className="rounded-xl border p-4 space-y-3 dark:border-zinc-800">
          <h3 className="font-semibold">{editId ? '编辑凭证' : '添加凭证'}</h3>

          <label className="block text-xs text-zinc-500">
            名称
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="我的 API Key"
            />
          </label>

          <label className="block text-xs text-zinc-500">
            类型
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, data: {} }))}
              className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>

          {fields.map((f) => (
            <label key={f.key} className="block text-xs text-zinc-500">
              {f.label}{f.secret ? ' (加密存储)' : ''}
              <input
                type={f.secret ? 'password' : 'text'}
                value={form.data[f.key] ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, data: { ...prev.data, [f.key]: e.target.value } }))}
                className="mt-1 h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                placeholder={f.placeholder}
              />
            </label>
          ))}

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={loading} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
              {loading ? '保存中...' : '保存'}
            </button>
            <button onClick={resetForm} className="rounded-xl border px-4 py-2 text-sm dark:border-zinc-800">取消</button>
          </div>
        </div>
      ) : null}

      {creds.length === 0 && !showCreate ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-zinc-400 dark:border-zinc-800">
          暂无凭证，点击上方按钮添加第一个
        </div>
      ) : (
        <div className="space-y-2">
          {creds.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border p-3 dark:border-zinc-800">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{c.name}</span>
                  <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">{TYPE_LABELS[c.type] ?? c.type}</span>
                </div>
                <div className="mt-0.5 text-xs text-zinc-400 truncate">
                  {c.maskedPreview || '(空)'} · {new Date(c.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {c.type === 'oauth2' ? (
                  <button onClick={() => handleOAuthAuthorize(c)} className="rounded-lg bg-green-100 px-2 py-1 text-[10px] text-green-700 dark:bg-green-950/30 dark:text-green-400">
                    授权
                  </button>
                ) : null}
                <button onClick={() => { setEditId(c.id); setForm({ name: c.name, type: c.type, data: {} }); setShowCreate(true) }} className="rounded-lg border px-2 py-1 text-[10px] dark:border-zinc-800">
                  编辑
                </button>
                <button onClick={() => handleDelete(c.id)} className="rounded-lg border px-2 py-1 text-[10px] text-red-500 dark:border-zinc-800">
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
