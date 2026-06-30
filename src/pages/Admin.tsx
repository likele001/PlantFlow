import { useEffect, useMemo, useState } from 'react'
import { Shield, Users } from 'lucide-react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'

type Member = {
  membershipId: string
  userId: string
  email: string
  role: string
}

type AuditLog = {
  id: string
  userEmail?: string | null
  action: string
  resourceType: string
  resourceId?: string | null
  createdAt: string
}

const ROLES = [
  { value: 'tenant_admin', label: '租户管理员' },
  { value: 'developer', label: '流程开发者' },
  { value: 'operator', label: '业务运营' },
  { value: 'agent', label: '客服坐席' },
]

export default function Admin() {
  const { user, tenant, token } = useAuthStore()
  const [members, setMembers] = useState<Member[]>([])
  const [audit, setAudit] = useState<AuditLog[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('developer')
  const [err, setErr] = useState<string | null>(null)

  const roleLabel = useMemo(() => {
    const r = user?.role ?? ''
    const map: Record<string, string> = {
      tenant_admin: '租户管理员',
      developer: '流程开发者',
      operator: '业务运营',
      agent: '客服坐席',
      platform_admin: '平台超管',
    }
    return map[r] || r || '未知'
  }, [user?.role])

  const isAdmin = user?.role === 'tenant_admin' || user?.role === 'platform_admin'

  async function load() {
    if (!token || !isAdmin) return
    const [mRes, aRes] = await Promise.all([
      apiRequest<Member[]>('/api/admin/members', { token }),
      apiRequest<AuditLog[]>('/api/admin/audit', { token }),
    ])
    if ('data' in mRes) setMembers(mRes.data)
    if ('data' in aRes) setAudit(aRes.data)
  }

  useEffect(() => {
    void load()
  }, [token, isAdmin])

  async function addMember() {
    if (!token || !email.trim() || !password) return
    const res = await apiRequest<Member>('/api/admin/members', {
      method: 'POST',
      token,
      body: { email: email.trim(), password, role },
    })
    if (!('data' in res)) {
      setErr(res.error)
      return
    }
    setEmail('')
    setPassword('')
    await load()
  }

  async function changeRole(membershipId: string, newRole: string) {
    if (!token) return
    await apiRequest(`/api/admin/members/${membershipId}`, {
      method: 'PATCH',
      token,
      body: { role: newRole },
    })
    await load()
  }

  async function removeMember(membershipId: string) {
    if (!token || !confirm('确定移除该成员？')) return
    await apiRequest(`/api/admin/members/${membershipId}`, { method: 'DELETE', token })
    await load()
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">系统管理</div>
        <div className="mt-2 text-2xl font-semibold">租户、用户与审计</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">当前租户</div>
              <div className="mt-1 text-sm text-zinc-500">{tenant?.name ?? '未选择'}</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">当前用户</div>
              <div className="mt-1 text-sm text-zinc-500">
                {user?.email ?? '未登录'} · {roleLabel}
              </div>
            </div>
          </div>
        </div>
      </div>

      {!isAdmin ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-700">
          仅租户管理员可管理用户与查看审计日志。
        </div>
      ) : (
        <>
          {err ? (
            <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-700">{err}</div>
          ) : null}

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-sm font-semibold">租户成员</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="邮箱"
                className="h-10 rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="初始密码"
                type="password"
                className="h-10 rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-10 rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void addMember()}
                className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950"
              >
                添加成员
              </button>
            </div>
            <table className="mt-4 w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-2">邮箱</th>
                  <th className="py-2">角色</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.membershipId} className="border-t dark:border-zinc-800">
                    <td className="py-3">{m.email}</td>
                    <td className="py-3">
                      <select
                        value={m.role}
                        onChange={(e) => void changeRole(m.membershipId, e.target.value)}
                        className="rounded-lg border px-2 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3">
                      <button type="button" onClick={() => void removeMember(m.membershipId)} className="text-xs text-red-600">
                        移除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-sm font-semibold">审计日志</div>
            <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
              {audit.map((a) => (
                <div key={a.id} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>{a.userEmail ?? '系统'}</span>
                    <span>{new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 font-semibold">{a.action}</div>
                  <div className="text-xs text-zinc-500">
                    {a.resourceType} {a.resourceId ?? ''}
                  </div>
                </div>
              ))}
              {!audit.length ? (
                <div className="py-8 text-center text-sm text-zinc-500">暂无审计记录</div>
              ) : null}
            </div>
          </div>

          {/* Tenant Management */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-sm font-semibold">客户租户管理</div>
            <div className="mt-2 text-xs text-zinc-500">为客户创建独立租户，数据完全隔离</div>
            <TenantManager token={token!} />
          </div>
        </>
      )}
    </div>
  )
}

function TenantManager({ token }: { token: string }) {
  const [tenants, setTenants] = useState<{ id: string; name: string; createdAt: string }[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const res = await apiRequest<{ id: string; name: string; createdAt: string }[]>('/api/tenants', { token })
    if ('data' in res) setTenants(res.data)
  }
  useEffect(() => { void load() }, [token])

  async function createTenant() {
    if (!name.trim() || !email.trim() || !password) return
    setLoading(true)
    const res = await fetch('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: name.trim(), adminEmail: email.trim(), adminPassword: password }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.success) {
      setMsg(`已创建「${name}」，客户可用 ${email} 登录`)
      setName(''); setEmail(''); setPassword('')
      await load()
    } else setMsg(data.error || '创建失败')
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="公司名称" className="h-9 flex-1 rounded-lg border px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="管理员邮箱" className="h-9 w-48 rounded-lg border px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码" type="password" className="h-9 w-32 rounded-lg border px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950" />
        <button onClick={createTenant} disabled={loading} className="h-9 rounded-lg bg-zinc-900 px-4 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">{loading ? '创建中' : '创建'}</button>
      </div>
      {msg ? <div className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</div> : null}
      <div className="text-xs text-zinc-500">已有 {tenants.length} 个租户</div>
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {tenants.slice(0, 10).map((t) => (
          <div key={t.id} className="flex justify-between rounded-lg border px-3 py-1.5 text-xs dark:border-zinc-800">
            <span>{t.name}</span>
            <span className="text-zinc-400">{new Date(t.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
