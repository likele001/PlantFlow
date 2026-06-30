import { useState } from 'react'
import { Lock, Save, User } from 'lucide-react'
import { apiRequest } from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'

export default function Profile() {
  const { user, tenant, token, logout } = useAuthStore()
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function changePassword() {
    setMsg(null)
    if (!currentPwd || !newPwd) {
      setMsg({ type: 'error', text: '请填写完整' })
      return
    }
    if (newPwd.length < 6) {
      setMsg({ type: 'error', text: '新密码至少 6 位' })
      return
    }
    if (newPwd !== confirmPwd) {
      setMsg({ type: 'error', text: '两次输入的新密码不一致' })
      return
    }
    setSaving(true)
    const res = await apiRequest('/api/auth/change-password', {
      method: 'POST',
      token,
      body: { currentPassword: currentPwd, newPassword: newPwd },
    })
    setSaving(false)
    if ('data' in res && res.success) {
      setMsg({ type: 'success', text: '密码已修改，3 秒后跳转到登录...' })
      setTimeout(() => { void logout() }, 3000)
    } else {
      setMsg({ type: 'error', text: ('error' in res ? res.error : '') || '修改失败' })
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-violet-500" />
        <h1 className="text-xl font-bold">账号设置</h1>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-sm font-semibold">基本信息</div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-zinc-500">邮箱</div>
            <div className="mt-1 font-medium">{user?.email}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">角色</div>
            <div className="mt-1 font-medium">
              {user?.role === 'tenant_admin' ? '租户管理员' : user?.role === 'platform_admin' ? '平台管理员' : user?.role ?? '-'}
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-zinc-500">租户</div>
            <div className="mt-1 font-medium">{tenant?.name ?? '-'}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="h-4 w-4" />
          修改密码
        </div>
        <div className="mt-1 text-xs text-zinc-500">修改成功后将自动登出，需用新密码重新登录</div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <div className="mb-1 text-xs text-zinc-500">当前密码</div>
            <input
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              className="h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="请输入当前密码"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs text-zinc-500">新密码（至少 6 位）</div>
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              className="h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="新密码"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs text-zinc-500">确认新密码</div>
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              className="h-10 w-full rounded-xl border px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="再次输入新密码"
            />
          </label>

          {msg ? (
            <div className={`rounded-xl border px-4 py-3 text-xs ${msg.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'}`}>
              {msg.text}
            </div>
          ) : null}

          <button
            onClick={changePassword}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            <Save className="h-4 w-4" />
            {saving ? '修改中...' : '保存新密码'}
          </button>
        </div>
      </div>
    </div>
  )
}