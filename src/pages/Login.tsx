import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ShieldCheck, Workflow } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

export default function Login() {
  const navigate = useNavigate()
  const { token, login, error, isLoading, hydrate } = useAuthStore()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('admin@example.com')
  const [password, setPassword] = useState('admin123')
  const [companyName, setCompanyName] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    if (token) navigate('/dashboard', { replace: true })
  }, [navigate, token])

  const showError = useMemo(() => localError ?? error, [error, localError])

  async function handleRegister() {
    setLocalError(null)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, email, password }),
      })
      const data = await res.json()
      if (!data.success) {
        setLocalError(data.error || '注册失败')
        return
      }
      useAuthStore.getState().setAuth(data.data.token, data.data.user, data.data.tenant)
      navigate('/dashboard', { replace: true })
    } catch {
      setLocalError('网络错误，请重试')
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLocalError(null)
    const ok = await login(email, password)
    if (!ok) setLocalError('登录失败，请检查账号密码')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <Workflow className="h-6 w-6 text-violet-400" />
            <span className="text-lg font-bold">PlantFlow</span>
          </div>
          <div className="text-xs text-zinc-500">企业级 AI 工作流平台</div>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="mx-auto w-full max-w-md">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-6 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.8)]">
              <div className="flex border-b border-zinc-800 mb-4">
                <button
                  onClick={() => { setMode('login'); setLocalError(null) }}
                  className={cn('flex-1 pb-3 text-sm font-semibold border-b-2 transition', mode === 'login' ? 'border-zinc-100 text-zinc-100' : 'border-transparent text-zinc-500')}
                >登录</button>
                <button
                  onClick={() => { setMode('register'); setLocalError(null) }}
                  className={cn('flex-1 pb-3 text-sm font-semibold border-b-2 transition', mode === 'register' ? 'border-zinc-100 text-zinc-100' : 'border-transparent text-zinc-500')}
                >注册</button>
              </div>

              {mode === 'login' ? (
                <form className="space-y-4" onSubmit={handleLogin}>
                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">邮箱</div>
                    <input value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm text-zinc-100 outline-none" placeholder="admin@example.com" autoComplete="email" />
                  </label>
                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">密码</div>
                    <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm text-zinc-100 outline-none" placeholder="请输入密码" autoComplete="current-password" />
                  </label>
                  {showError ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">{showError}</div> : null}
                  <button type="submit" disabled={isLoading} className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 hover:bg-white transition">
                    {isLoading ? '登录中…' : '进入控制台'}<ArrowRight className="h-4 w-4" />
                  </button>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-400">
                    <div className="font-semibold text-zinc-200">演示账号</div>
                    <div className="mt-1">admin@example.com / admin123</div>
                  </div>
                </form>
              ) : (
                <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void handleRegister() }}>
                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">公司名称</div>
                    <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm text-zinc-100 outline-none" placeholder="XX科技有限公司" />
                  </label>
                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">管理员邮箱</div>
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm text-zinc-100 outline-none" placeholder="admin@company.com" autoComplete="email" />
                  </label>
                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">密码（至少 6 位）</div>
                    <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm text-zinc-100 outline-none" placeholder="至少6位密码" autoComplete="new-password" />
                  </label>
                  {showError ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">{showError}</div> : null}
                  <button type="submit" className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-500 text-sm font-semibold text-white hover:bg-violet-400 transition">
                    免费注册<ArrowRight className="h-4 w-4" />
                  </button>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-400">
                    <ShieldCheck className="inline h-3.5 w-3.5 mr-1 text-emerald-400" />
                    注册即创建独立租户，数据完全隔离，支持 AI 对话 + 知识库 + 工作流。
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
